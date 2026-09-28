import { ATTRIBUTE_KEYS, attributeDef, valueDef } from '../domain/taxonomy'
import type { Watch } from '../domain/types'
import type { Engine } from './context'
import type { TasteGroup } from './directions'
import { groupAffinity, maxSimilarity, meanSimilarity } from './selection'
import type { Stats } from './stats'

/** Suggestions must genuinely resemble what was liked. */
const MIN_GROUP_SIMILARITY = 0.5
/** Wildcards must not look like something already rejected. */
const MAX_WILDCARD_NAY_SIMILARITY = 0.75
const NEAR_DUPLICATE = 0.9

export interface Recommendation {
  watch: Watch
  kind: 'similar' | 'wildcard'
  /** Index into the taste groups for kind "similar". */
  group?: number
  /** The liked watches this suggestion resembles. */
  because: Watch[]
  /** Design traits shared with those liked watches (plain labels). */
  sharedLabels: string[]
  reason: string
}

export interface RecommendOptions {
  maxGroups?: number
  perGroup?: number
  wildcards?: number
  nameOf?: (w: Watch) => string
}

/**
 * New designs worth exploring: unseen watches that resemble each liked
 * group (so every taste direction is represented), plus wildcards that are
 * unlike anything seen so far. Every "similar" suggestion points at the
 * actual liked watches it resembles.
 */
export function recommend(engine: Engine, stats: Stats, groups: TasteGroup[], options: RecommendOptions = {}): Recommendation[] {
  const { maxGroups = 3, perGroup = 2, wildcards = 2, nameOf = (w: Watch) => w.displayName } = options
  const unseen = engine.pool.filter((w) => !stats.seen.has(w.id))
  const out: Recommendation[] = []
  const taken = (w: Watch) => out.some((r) => r.watch.id === w.id || engine.sim.get(r.watch.id, w.id) >= NEAR_DUPLICATE)

  groups.slice(0, maxGroups).forEach((group, gi) => {
    const quota = group.members.length >= 2 ? perGroup : 1
    const ranked = unseen
      .filter((w) => meanSimilarity(engine, w, group.members) >= MIN_GROUP_SIMILARITY)
      .map((w) => ({ w, score: groupAffinity(engine, stats, w, group) }))
      .sort((a, b) => b.score - a.score || a.w.id.localeCompare(b.w.id))
    let added = 0
    for (const { w } of ranked) {
      if (added >= quota) break
      if (taken(w)) continue
      const because = [...group.members]
        .sort((a, b) => engine.sim.get(w.id, b.id) - engine.sim.get(w.id, a.id))
        .slice(0, 2)
      const sharedLabels = sharedWith(w, group.members)
      out.push({ watch: w, kind: 'similar', group: gi, because, sharedLabels, reason: similarReason(because, sharedLabels, nameOf) })
      added++
    }
  })

  const shown = stats.reactions.map((r) => r.watch)
  const wild = unseen
    .filter((w) => !taken(w) && maxSimilarity(engine, w, stats.nays) < MAX_WILDCARD_NAY_SIMILARITY)
    .map((w) => ({ w, novelty: 1 - maxSimilarity(engine, w, shown) }))
    .sort((a, b) => b.novelty - a.novelty || a.w.id.localeCompare(b.w.id))
  let addedWild = 0
  for (const { w } of wild) {
    if (addedWild >= wildcards) break
    if (taken(w)) continue
    out.push({
      watch: w,
      kind: 'wildcard',
      because: [],
      sharedLabels: [],
      reason: stats.yay
        ? 'Different from everything you have seen so far — worth a look to keep your options open.'
        : 'A different direction to try.',
    })
    addedWild++
  }
  return out
}

/** Observable traits the watch shares with at least half of the liked group. */
function sharedWith(w: Watch, members: Watch[]): string[] {
  const labels: Array<{ label: string; weight: number }> = []
  for (const key of ATTRIBUTE_KEYS) {
    const mine = w.attributes[key] as string | string[]
    for (const value of Array.isArray(mine) ? mine : [mine]) {
      const def = valueDef(key, value)
      if (!def || def.observable === false) continue
      const count = members.filter((m) => {
        const theirs = m.attributes[key] as string | string[]
        return Array.isArray(theirs) ? theirs.includes(value) : theirs === value
      }).length
      if (count / members.length >= 0.5) labels.push({ label: def.label, weight: attributeDef(key).weight })
    }
  }
  return labels
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((l) => l.label)
}

function similarReason(because: Watch[], shared: string[], nameOf: (w: Watch) => string): string {
  const names = because.map(nameOf)
  const who = names.length === 1 ? `the ${names[0]}` : `the ${names[0]} and the ${names[1]}`
  if (!shared.length) return `Close in overall design to ${who} you liked.`
  return `Like ${who} you liked: ${shared.map((s) => s.toLowerCase()).join(', ')}.`
}
