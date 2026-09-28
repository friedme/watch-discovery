import { ATTRIBUTE_KEYS, attributeDef, parseValueKey, valueDef, valueKey, valueKeysOf } from '../domain/taxonomy'
import type { Vote, Watch } from '../domain/types'
import type { Engine } from './context'
import { groupLikes } from './directions'
import type { TasteGroup } from './directions'
import { hashParts, mulberry32 } from './rng'
import { computeStats, uncertainty } from './stats'
import type { Stats } from './stats'

export type Strategy = 'curated' | 'deepen' | 'explore' | 'contrast' | 'wildcard'

/**
 * Repeating plan for adaptive exploration. Half the cards deepen a taste
 * direction (rotating between directions so none crowds out the others),
 * the rest test contrasts, cover unexplored designs, or are wildcards.
 */
export const ADAPTIVE_SCHEDULE: Strategy[] = ['deepen', 'explore', 'deepen', 'contrast', 'deepen', 'wildcard']
/** At most this many directions share the "deepen" turns. */
export const MAX_ROTATING_DIRECTIONS = 4
/** Avoid showing two near-identical designs back to back. */
const NEAR_DUPLICATE = 0.9
/** How strongly resemblance to a Nay'd design pushes a candidate down. */
const NAY_PENALTY = 0.35

export interface Pick {
  watch: Watch
  phase: 'opening' | 'second' | 'adaptive'
  strategy: Strategy
  /** 0-based position within the adaptive phase. */
  adaptiveIndex?: number
  /** Which liked group a "deepen" card is drawn towards. */
  group?: number
}

export function strategyFor(adaptiveIndex: number): Strategy {
  return ADAPTIVE_SCHEDULE[adaptiveIndex % ADAPTIVE_SCHEDULE.length]
}

/** How many times `strategy` occurred in the schedule before `adaptiveIndex`. */
export function turnsBefore(strategy: Strategy, adaptiveIndex: number): number {
  const perCycle = ADAPTIVE_SCHEDULE.filter((s) => s === strategy).length
  const full = Math.floor(adaptiveIndex / ADAPTIVE_SCHEDULE.length) * perCycle
  const partial = ADAPTIVE_SCHEDULE.slice(0, adaptiveIndex % ADAPTIVE_SCHEDULE.length).filter((s) => s === strategy).length
  return full + partial
}

/**
 * The next card to show. A pure function of (engine, votes): the curated
 * opening round first, then adaptive exploration. Returns null when every
 * playable watch in the collection has been seen.
 */
export function nextPick(engine: Engine, votes: readonly Vote[]): Pick | null {
  const stats = computeStats(engine, votes)
  for (const w of engine.fixed) {
    if (!stats.seen.has(w.id)) return { watch: w, phase: engine.openingIds.has(w.id) ? 'opening' : 'second', strategy: 'curated' }
  }
  const candidates = engine.pool.filter((w) => !stats.seen.has(w.id))
  if (candidates.length === 0) return null

  let adaptiveIndex = 0
  for (const id of stats.seen) if (!engine.fixedIds.has(id)) adaptiveIndex++
  const strategy = strategyFor(adaptiveIndex)
  const previous = stats.reactions.at(-1)?.watch
  const pool = withoutNearDuplicates(engine, candidates, previous)
  const groups = groupLikes(stats.yays, engine.sim)
  const rng = mulberry32(hashParts(engine.seed, adaptiveIndex, strategy))
  const ctx: PickContext = { engine, stats, pool, groups, rng, adaptiveIndex }

  const picked =
    (strategy === 'deepen' && pickDeepen(ctx)) ||
    (strategy === 'contrast' && pickContrast(ctx)) ||
    (strategy === 'wildcard' && pickWildcard(ctx)) ||
    pickExplore(ctx)
  return { ...picked, phase: 'adaptive', adaptiveIndex }
}

interface PickContext {
  engine: Engine
  stats: Stats
  pool: Watch[]
  groups: TasteGroup[]
  rng: () => number
  adaptiveIndex: number
}

type Scored = Omit<Pick, 'phase' | 'adaptiveIndex'>

function withoutNearDuplicates(engine: Engine, candidates: Watch[], previous: Watch | undefined): Watch[] {
  if (!previous) return candidates
  const filtered = candidates.filter((c) => engine.sim.get(c.id, previous.id) < NEAR_DUPLICATE)
  return filtered.length ? filtered : candidates
}

function argmax(pool: Watch[], score: (w: Watch) => number, rng: () => number, jitter: number): Watch | null {
  let best: Watch | null = null
  let bestScore = -Infinity
  for (const w of pool) {
    const s = score(w) + rng() * jitter
    if (s > bestScore) {
      bestScore = s
      best = w
    }
  }
  return best
}

export function maxSimilarity(engine: Engine, w: Watch, others: Watch[]): number {
  let m = 0
  for (const o of others) m = Math.max(m, engine.sim.get(w.id, o.id))
  return m
}

export function meanSimilarity(engine: Engine, w: Watch, others: Watch[]): number {
  if (!others.length) return 0
  let total = 0
  for (const o of others) total += engine.sim.get(w.id, o.id)
  return total / others.length
}

/** Closeness to a liked group, discounted by resemblance to rejected designs. */
export function groupAffinity(engine: Engine, stats: Stats, w: Watch, group: TasteGroup): number {
  return meanSimilarity(engine, w, group.members) - NAY_PENALTY * maxSimilarity(engine, w, stats.nays)
}

/**
 * Liked groups that take turns being deepened. Every group of two or more
 * stays in; a single liked watch is retired once two later exploration cards
 * that closely resemble it got a Nay — one-off likes get a fair test without
 * hogging turns. (Opening and second-round cards don't count: they were not
 * attempts to follow up on that like.)
 */
export function rotatingGroups(engine: Engine, stats: Stats, groups: TasteGroup[]): TasteGroup[] {
  return groups.filter((g) => g.members.length >= 2 || !exhaustedOneOff(engine, stats, g.members[0])).slice(0, MAX_ROTATING_DIRECTIONS)
}

const ONE_OFF_RESEMBLANCE = 0.55

function exhaustedOneOff(engine: Engine, stats: Stats, liked: Watch): boolean {
  const start = stats.reactions.findIndex((r) => r.watch.id === liked.id)
  let misses = 0
  for (const r of stats.reactions.slice(start + 1)) {
    if (r.choice !== 'nay' || engine.fixedIds.has(r.watch.id)) continue
    if (engine.sim.get(r.watch.id, liked.id) >= ONE_OFF_RESEMBLANCE) misses++
  }
  return misses >= 2
}

function pickDeepen(ctx: PickContext): Scored | null {
  const { engine, stats, pool, groups, rng, adaptiveIndex } = ctx
  const rotating = rotatingGroups(engine, stats, groups)
  if (!rotating.length) return null
  const turn = turnsBefore('deepen', adaptiveIndex) % rotating.length
  const target = rotating[turn]
  const watch = argmax(pool, (w) => groupAffinity(engine, stats, w, target), rng, 0.02)
  return watch && { watch, strategy: 'deepen', group: groups.indexOf(target) }
}

/** Mean uncertainty over the watch's observable design values. */
function novelty(stats: Stats, w: Watch): number {
  const keys = valueKeysOf(w.attributes).filter((vk) => {
    const { key, value } = parseValueKey(vk)
    return valueDef(key, value)?.observable !== false
  })
  if (!keys.length) return 0
  return keys.reduce((sum, vk) => sum + uncertainty(stats, vk), 0) / keys.length
}

function pickExplore(ctx: PickContext): Scored {
  const { stats, pool, rng } = ctx
  const watch = argmax(pool, (w) => novelty(stats, w), rng, 0.05)!
  return { watch, strategy: 'explore' }
}

/**
 * A design close to something liked but differing in an aspect we know
 * little about — helps tell apart *which* aspect mattered.
 */
function pickContrast(ctx: PickContext): Scored | null {
  const { engine, stats, pool, rng, adaptiveIndex } = ctx
  if (!stats.yays.length) return null
  const anchors = [...stats.yays].reverse()
  const anchor = anchors[turnsBefore('contrast', adaptiveIndex) % anchors.length]
  const scored = pool.filter((c) => engine.sim.get(c.id, anchor.id) >= 0.5)
  const watch = argmax(
    scored,
    (c) => {
      const diffs = ATTRIBUTE_KEYS.filter((k) => !attributeDef(k).multi && c.attributes[k] !== anchor.attributes[k])
      if (!diffs.length) return -Infinity
      const unc = diffs.reduce((sum, k) => sum + uncertainty(stats, valueKey(k, c.attributes[k] as string)), 0) / diffs.length
      return engine.sim.get(c.id, anchor.id) + 0.5 * unc
    },
    rng,
    0.02,
  )
  return watch && { watch, strategy: 'contrast' }
}

/** Something unlike anything shown so far — keeps the door open to surprises. */
function pickWildcard(ctx: PickContext): Scored | null {
  const { engine, stats, pool, rng } = ctx
  const shown = stats.reactions.map((r) => r.watch)
  const watch = argmax(
    pool,
    (c) => 1 - maxSimilarity(engine, c, shown) - 0.25 * maxSimilarity(engine, c, stats.nays),
    rng,
    0.08,
  )
  return watch && { watch, strategy: 'wildcard' }
}
