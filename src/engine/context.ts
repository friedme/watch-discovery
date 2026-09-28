import type { Watch } from '../domain/types'
import { hashParts, mulberry32 } from './rng'
import { SimilarityIndex } from './similarity'

/**
 * Everything the engine needs to derive a session's state from its vote log.
 * The engine holds no mutable state: identical (engine, votes) always yield
 * identical cards and results — which is what makes Undo exact.
 */
export interface Engine {
  /** Playable watches in the chosen collection, in stable catalogue order. */
  pool: Watch[]
  byId: Map<string, Watch>
  /** Curated opening sequence (subset of the pool). */
  opening: Watch[]
  openingIds: Set<string>
  /** Optional unlabelled second round (reference watches mixed with lookalikes). */
  second: Watch[]
  /** Opening + second round: always shown first, in this order. */
  fixed: Watch[]
  fixedIds: Set<string>
  sim: SimilarityIndex
  seed: number
}

export function createEngine(pool: Watch[], opening: Watch[], seed: number, sim?: SimilarityIndex, second: Watch[] = []): Engine {
  const byId = new Map(pool.map((w) => [w.id, w]))
  const safeOpening = opening.filter((w) => byId.has(w.id))
  const openingIds = new Set(safeOpening.map((w) => w.id))
  const safeSecond = second.filter((w, i) => byId.has(w.id) && !openingIds.has(w.id) && second.findIndex((x) => x.id === w.id) === i)
  const fixed = [...safeOpening, ...safeSecond]
  return {
    pool,
    byId,
    opening: safeOpening,
    openingIds,
    second: safeSecond,
    fixed,
    fixedIds: new Set(fixed.map((w) => w.id)),
    sim: sim ?? new SimilarityIndex(pool),
    seed,
  }
}

/** At most this many reference watches go into the second round. */
export const MAX_SECOND_ROUND_REFERENCES = 24

/**
 * An unlabelled second round: the reference watches (in priority order, then
 * shuffled with the session seed) with a lookalike that is *not* on the list
 * after every third one. Mixing in lookalikes keeps the round from being
 * "obviously someone's list" and shows designs next to that taste.
 */
export function buildSecondRound(pool: Watch[], opening: Watch[], referenceIds: string[], seed: number, sim: SimilarityIndex): Watch[] {
  const byId = new Map(pool.map((w) => [w.id, w]))
  const onList = new Set(referenceIds)
  const used = new Set(opening.map((w) => w.id))
  const refs = referenceIds
    .filter((id) => byId.has(id) && !used.has(id))
    .slice(0, MAX_SECOND_ROUND_REFERENCES)
    .map((id) => byId.get(id)!)
  const rng = mulberry32(hashParts(seed, 'second-round'))
  for (let i = refs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[refs[i], refs[j]] = [refs[j], refs[i]]
  }
  const out: Watch[] = []
  refs.forEach((w, i) => {
    out.push(w)
    used.add(w.id)
    if (i % 3 !== 2) return
    let best: Watch | undefined
    let bestSim = 0.5
    for (const c of pool) {
      if (used.has(c.id) || onList.has(c.id)) continue
      const s = sim.get(c.id, w.id)
      if (s > bestSim) {
        best = c
        bestSim = s
      }
    }
    if (best) {
      out.push(best)
      used.add(best.id)
    }
  })
  return out
}

/**
 * Resolves curated opening slots against what is actually playable.
 * Each slot lists preferred watch ids in order; the first playable, unused
 * one wins. Slots with nothing playable are skipped rather than padded with
 * placeholders.
 */
export function resolveOpening(slots: string[][], pool: Watch[]): Watch[] {
  const byId = new Map(pool.map((w) => [w.id, w]))
  const used = new Set<string>()
  const out: Watch[] = []
  for (const slot of slots) {
    const id = slot.find((candidate) => byId.has(candidate) && !used.has(candidate))
    if (!id) continue
    used.add(id)
    out.push(byId.get(id)!)
  }
  return out
}

/** Interleaves two opening sequences (for the "both" collection), skipping duplicates. */
export function interleaveOpenings(a: Watch[], b: Watch[], perSide: number): Watch[] {
  const out: Watch[] = []
  const used = new Set<string>()
  const left = a.slice(0, perSide)
  const right = b.slice(0, perSide)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    for (const w of [left[i], right[i]]) {
      if (w && !used.has(w.id)) {
        used.add(w.id)
        out.push(w)
      }
    }
  }
  return out
}
