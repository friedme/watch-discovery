import { valueKeysOf } from '../domain/taxonomy'
import type { Choice, Vote, Watch } from '../domain/types'
import type { Engine } from './context'

export interface ValueStat {
  yay: number
  nay: number
}

export interface Stats {
  yay: number
  nay: number
  pass: number
  /** Yay + Nay. Passes carry no preference signal and are never counted here. */
  decisive: number
  /** Counts per attribute value ("dialColour:blue"), Yay and Nay only. */
  byValue: Map<string, ValueStat>
  yays: Watch[]
  nays: Watch[]
  passes: Watch[]
  /** Every watch already shown (including passes). */
  seen: Set<string>
  /** Chronological reactions to watches in this engine's pool. */
  reactions: Array<{ watch: Watch; choice: Choice }>
}

/**
 * Folds the vote log into counts. Votes for watches outside the pool
 * (e.g. removed from the catalogue) are ignored; a repeated watch id only
 * counts once (first reaction wins).
 */
export function computeStats(engine: Engine, votes: readonly Vote[]): Stats {
  const stats: Stats = {
    yay: 0,
    nay: 0,
    pass: 0,
    decisive: 0,
    byValue: new Map(),
    yays: [],
    nays: [],
    passes: [],
    seen: new Set(),
    reactions: [],
  }
  for (const vote of votes) {
    const watch = engine.byId.get(vote.watchId)
    if (!watch || stats.seen.has(watch.id)) continue
    stats.seen.add(watch.id)
    stats.reactions.push({ watch, choice: vote.choice })
    if (vote.choice === 'pass') {
      stats.pass++
      stats.passes.push(watch)
      continue
    }
    const isYay = vote.choice === 'yay'
    if (isYay) {
      stats.yay++
      stats.yays.push(watch)
    } else {
      stats.nay++
      stats.nays.push(watch)
    }
    for (const vk of valueKeysOf(watch.attributes)) {
      const s = stats.byValue.get(vk) ?? { yay: 0, nay: 0 }
      if (isYay) s.yay++
      else s.nay++
      stats.byValue.set(vk, s)
    }
  }
  stats.decisive = stats.yay + stats.nay
  return stats
}

/** How little we know about an attribute value: 1 when never judged, → 0 with evidence. */
export function uncertainty(stats: Stats, vk: string): number {
  const s = stats.byValue.get(vk)
  const n = s ? s.yay + s.nay : 0
  return 1 / (1 + n)
}
