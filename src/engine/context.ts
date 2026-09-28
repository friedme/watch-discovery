import type { Watch } from '../domain/types'
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
  sim: SimilarityIndex
  seed: number
}

export function createEngine(pool: Watch[], opening: Watch[], seed: number, sim?: SimilarityIndex): Engine {
  const byId = new Map(pool.map((w) => [w.id, w]))
  const safeOpening = opening.filter((w) => byId.has(w.id))
  return {
    pool,
    byId,
    opening: safeOpening,
    openingIds: new Set(safeOpening.map((w) => w.id)),
    sim: sim ?? new SimilarityIndex(pool),
    seed,
  }
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
