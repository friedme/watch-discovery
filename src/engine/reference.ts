import type { ReferenceProfile, Stance } from '../domain/reference'
import { ATTRIBUTE_KEYS, attributeDef, valueDef, valueKey } from '../domain/taxonomy'
import type { AttributeKey } from '../domain/taxonomy'
import type { Choice, Vote, Watch } from '../domain/types'
import type { Engine } from './context'
import type { Direction } from './profile'
import { maxSimilarity } from './selection'
import { computeStats } from './stats'

/** Her Yay counts as "close to the list" at or above this similarity to a listed favourite. */
export const ADJACENT_SIMILARITY = 0.6
/** Her taste direction counts as "not on the list" when every member is below this. */
const FAR_SIMILARITY = 0.5

export interface ReferenceItem {
  watch: Watch
  stance: Stance
  direction?: string
  note?: string
  /** The other person's reaction, if they have seen it. */
  choice?: Choice
}

export interface TraitComparison {
  key: AttributeKey
  value: string
  label: string
  /** How many of the listed favourites have this trait. */
  inList: number
  listSize: number
  /** The other person's reactions to all watches with this trait. */
  yay: number
  nay: number
}

export interface ReferenceReport {
  /** Listed watches that have a photo in this collection. */
  listed: number
  /** Listed watches that can't be shown yet (no photo / other collection). */
  notAvailable: number
  /** Listed watches that got a Yay or Nay. */
  reacted: number
  agree: ReferenceItem[]
  differ: ReferenceItem[]
  maybes: ReferenceItem[]
  ruledOutButLiked: ReferenceItem[]
  bothRuledOut: ReferenceItem[]
  passed: ReferenceItem[]
  unseen: ReferenceItem[]
  directions: Array<{ key: string; title: string; yay: number; nay: number; items: ReferenceItem[] }>
  traits: TraitComparison[]
  /** Watches not on the list that were liked and resemble a listed favourite. */
  adjacent: Array<{ watch: Watch; closest: Watch; shared: string[] }>
  /** Liked directions with nothing close on the list. */
  farDirections: Direction[]
}

const FAVOURITE: Stance[] = ['owned', 'likes']

/**
 * Compares a declared taste (a reference profile) with someone's blind
 * reactions. Counts only; every line points at actual watches and reactions.
 */
export function buildReferenceReport(engine: Engine, votes: readonly Vote[], profile: ReferenceProfile, directions: Direction[]): ReferenceReport {
  const stats = computeStats(engine, votes)
  const choiceOf = new Map(stats.reactions.map((r) => [r.watch.id, r.choice]))
  const items: ReferenceItem[] = profile.watches
    .filter((w) => engine.byId.has(w.id))
    .map((w) => ({ watch: engine.byId.get(w.id)!, stance: w.stance, direction: w.direction, note: w.note, choice: choiceOf.get(w.id) }))
  const listIds = new Set(profile.watches.map((w) => w.id))
  const favourites = items.filter((i) => FAVOURITE.includes(i.stance)).map((i) => i.watch)
  const is = (i: ReferenceItem, stances: Stance[], choice: Choice) => stances.includes(i.stance) && i.choice === choice

  const dirs = Object.entries(profile.directions ?? {}).map(([key, title]) => {
    const inDir = items.filter((i) => i.direction === key)
    return {
      key,
      title,
      yay: inDir.filter((i) => i.choice === 'yay').length,
      nay: inDir.filter((i) => i.choice === 'nay').length,
      items: inDir,
    }
  })

  return {
    listed: items.length,
    notAvailable: profile.watches.length - items.length,
    reacted: items.filter((i) => i.choice === 'yay' || i.choice === 'nay').length,
    agree: items.filter((i) => is(i, FAVOURITE, 'yay')),
    differ: items.filter((i) => is(i, FAVOURITE, 'nay')),
    maybes: items.filter((i) => i.stance === 'unsure' && (i.choice === 'yay' || i.choice === 'nay')),
    ruledOutButLiked: items.filter((i) => is(i, ['dislikes'], 'yay')),
    bothRuledOut: items.filter((i) => is(i, ['dislikes'], 'nay')),
    passed: items.filter((i) => i.choice === 'pass'),
    unseen: items.filter((i) => !i.choice),
    directions: dirs,
    traits: traitComparison(stats.byValue, favourites),
    adjacent: adjacentLikes(engine, stats.yays, favourites, listIds),
    farDirections: favourites.length ? directions.filter((d) => d.members.every((m) => maxSimilarity(engine, m, favourites) < FAR_SIMILARITY)) : [],
  }
}

/** Salient traits most listed favourites share, with the other person's reactions to those traits overall. */
function traitComparison(byValue: Map<string, { yay: number; nay: number }>, favourites: Watch[]): TraitComparison[] {
  if (favourites.length < 3) return []
  const out: TraitComparison[] = []
  for (const key of ATTRIBUTE_KEYS) {
    const def = attributeDef(key)
    if (def.multi || def.weight < 1) continue
    const counts = new Map<string, number>()
    for (const w of favourites) counts.set(w.attributes[key] as string, (counts.get(w.attributes[key] as string) ?? 0) + 1)
    for (const [value, inList] of counts) {
      const vd = valueDef(key, value)
      if (!vd || vd.observable === false) continue
      if (inList < 3 || inList / favourites.length < 0.5) continue
      const s = byValue.get(valueKey(key, value)) ?? { yay: 0, nay: 0 }
      if (s.yay + s.nay < 2) continue
      out.push({ key, value, label: vd.label, inList, listSize: favourites.length, yay: s.yay, nay: s.nay })
    }
  }
  return out.sort((a, b) => b.inList - a.inList || attributeDef(b.key).weight - attributeDef(a.key).weight)
}

function adjacentLikes(engine: Engine, yays: Watch[], favourites: Watch[], listIds: Set<string>) {
  if (!favourites.length) return []
  return yays
    .filter((w) => !listIds.has(w.id))
    .map((w) => {
      let closest = favourites[0]
      for (const f of favourites) if (engine.sim.get(w.id, f.id) > engine.sim.get(w.id, closest.id)) closest = f
      return { watch: w, closest, sim: engine.sim.get(w.id, closest.id) }
    })
    .filter((x) => x.sim >= ADJACENT_SIMILARITY)
    .sort((a, b) => b.sim - a.sim || a.watch.id.localeCompare(b.watch.id))
    .slice(0, 6)
    .map(({ watch, closest }) => ({ watch, closest, shared: sharedTraits(watch, closest) }))
}

function sharedTraits(a: Watch, b: Watch): string[] {
  return ATTRIBUTE_KEYS.filter((k) => !attributeDef(k).multi && attributeDef(k).weight >= 1 && a.attributes[k] === b.attributes[k])
    .map((k) => valueDef(k, a.attributes[k] as string))
    .filter((d): d is NonNullable<typeof d> => !!d && d.observable !== false)
    .slice(0, 3)
    .map((d) => d.label.toLowerCase())
}
