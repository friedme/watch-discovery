import { attributeDef, parseValueKey, valueDef, valueKeysOf } from '../domain/taxonomy'
import type { AttributeKey } from '../domain/taxonomy'
import type { Watch } from '../domain/types'
import type { Engine } from './context'
import type { Stats } from './stats'

/** No observations at all before this many Yay/Nay reactions. */
export const MIN_DECISIVE_FOR_OBSERVATIONS = 8
/** A pattern needs at least this many matching reactions behind it. */
export const MIN_EVIDENCE = 3
/** Only the most visually salient attributes get "mixed reactions" notes. */
const MIXED_KEYS: AttributeKey[] = ['style', 'caseShape', 'caseColour', 'dialColour', 'band']
/**
 * Traits shared by at least this share of the collection are too common to be
 * informative as a "mixed reactions" note or as a possible alternative explanation.
 */
const COMMON_TRAIT_SHARE = 0.5

export type ObservationKind = 'drawn' | 'less' | 'mixed'

export interface Observation {
  kind: ObservationKind
  key: AttributeKey
  value: string
  label: string
  yay: number
  nay: number
  text: string
  /** The actual reactions this observation rests on. */
  likedExamples: Watch[]
  dislikedExamples: Watch[]
  /** Set when every example also shared another trait, so the two can't be told apart yet. */
  confoundText?: string
  strength: number
}

export interface ObservationLimits {
  drawn: number
  less: number
  mixed: number
}

const DEFAULT_LIMITS: ObservationLimits = { drawn: 4, less: 3, mixed: 2 }

/**
 * Cautious, count-based observations. Every sentence states the actual
 * numbers behind it ("5 of the 6 watches with a blue face"): no percentages,
 * no match scores, no personality labels. Passes are ignored entirely.
 */
export function computeObservations(engine: Engine, stats: Stats, limits = DEFAULT_LIMITS): Observation[] {
  if (stats.decisive < MIN_DECISIVE_FOR_OBSERVATIONS) return []
  const base = stats.yay / stats.decisive
  const candidates: Observation[] = []
  const share = poolShares(engine)

  for (const [vk, s] of stats.byValue) {
    const { key, value } = parseValueKey(vk)
    const def = valueDef(key, value)
    if (!def || def.observable === false) continue
    const n = s.yay + s.nay
    if (n < MIN_EVIDENCE) continue
    const rate = s.yay / n
    let kind: ObservationKind | null = null
    if (s.yay >= MIN_EVIDENCE && rate >= Math.max(0.6, base + 0.2)) kind = 'drawn'
    else if (s.nay >= MIN_EVIDENCE && rate <= Math.min(0.4, base - 0.2)) kind = 'less'
    else if (
      MIXED_KEYS.includes(key) &&
      (share.get(vk) ?? 0) < COMMON_TRAIT_SHARE &&
      n >= 4 &&
      s.yay >= 2 &&
      s.nay >= 2 &&
      rate >= 0.35 &&
      rate <= 0.65
    )
      kind = 'mixed'
    if (!kind) continue

    const has = (w: Watch) => valueKeysOf(w.attributes).includes(vk)
    const likedExamples = stats.yays.filter(has)
    const dislikedExamples = stats.nays.filter(has)
    const strength = kind === 'mixed' ? Math.sqrt(n) * 0.1 : Math.abs(rate - base) * Math.sqrt(n)
    candidates.push({
      kind,
      key,
      value,
      label: def.label,
      yay: s.yay,
      nay: s.nay,
      text: sentence(kind, s.yay, s.nay, def.phrase),
      likedExamples,
      dislikedExamples,
      strength: strength + attributeDef(key).weight * 1e-3,
    })
  }

  candidates.sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key) || a.value.localeCompare(b.value))

  const picked: Observation[] = []
  const used: Record<ObservationKind, number> = { drawn: 0, less: 0, mixed: 0 }
  for (const obs of candidates) {
    if (used[obs.kind] >= limits[obs.kind]) continue
    // Skip restatements: same kind, (almost) the same watches behind it.
    if (picked.some((p) => p.kind === obs.kind && overlap(p, obs) >= 0.8)) continue
    if (obs.kind !== 'mixed') obs.confoundText = confound(share, obs)
    picked.push(obs)
    used[obs.kind]++
  }
  return picked
}

function sentence(kind: ObservationKind, yay: number, nay: number, phrase: string): string {
  const n = yay + nay
  if (kind === 'drawn') return yay === n ? `You said Yay to all ${n} watches ${phrase}.` : `You said Yay to ${yay} of the ${n} watches ${phrase}.`
  if (kind === 'less') return nay === n ? `You said Nay to all ${n} watches ${phrase}.` : `You said Nay to ${nay} of the ${n} watches ${phrase}.`
  return `Watches ${phrase} got mixed reactions: ${yay} Yay, ${nay} Nay.`
}

function evidenceIds(o: Observation): Set<string> {
  return new Set((o.kind === 'less' ? o.dislikedExamples : o.likedExamples).map((w) => w.id))
}

function overlap(a: Observation, b: Observation): number {
  const x = evidenceIds(a)
  const y = evidenceIds(b)
  const inter = [...x].filter((id) => y.has(id)).length
  const union = new Set([...x, ...y]).size
  return union ? inter / union : 0
}

/**
 * If every example behind an observation also shared another uncommon trait,
 * say so — the photos can't yet tell which of the two drove the reaction.
 */
function confound(share: Map<string, number>, obs: Observation): string | undefined {
  const examples = obs.kind === 'less' ? obs.dislikedExamples : obs.likedExamples
  if (examples.length < MIN_EVIDENCE) return undefined
  const ownKey = `${obs.key}:${obs.value}`
  let common = new Set(valueKeysOf(examples[0].attributes))
  for (const w of examples.slice(1)) {
    const keys = new Set(valueKeysOf(w.attributes))
    common = new Set([...common].filter((k) => keys.has(k)))
  }
  let best: { key: AttributeKey; phrase: string; weight: number } | undefined
  for (const vk of common) {
    if (vk === ownKey) continue
    const { key, value } = parseValueKey(vk)
    if (key === obs.key) continue
    const def = valueDef(key, value)
    if (!def || def.observable === false) continue
    // A trait most watches in the collection have explains nothing.
    if ((share.get(vk) ?? 0) >= COMMON_TRAIT_SHARE) continue
    const weight = attributeDef(key).weight
    if (!best || weight > best.weight) best = { key, phrase: def.phrase, weight }
  }
  if (!best) return undefined
  const who = obs.kind === 'less' ? 'you said Nay to' : 'you liked'
  return `All ${examples.length} ${who} were also watches ${best.phrase}, so it could be either.`
}

/** Share of the collection that has each attribute value. */
function poolShares(engine: Engine): Map<string, number> {
  const counts = new Map<string, number>()
  for (const w of engine.pool) for (const vk of valueKeysOf(w.attributes)) counts.set(vk, (counts.get(vk) ?? 0) + 1)
  const out = new Map<string, number>()
  for (const [vk, c] of counts) out.set(vk, c / Math.max(1, engine.pool.length))
  return out
}
