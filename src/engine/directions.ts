import { ATTRIBUTE_KEYS, attributeDef, valueDef } from '../domain/taxonomy'
import type { AttributeKey } from '../domain/taxonomy'
import type { Watch } from '../domain/types'
import type { SimilarityIndex } from './similarity'

/** Average-linkage similarity above which liked watches are grouped together. */
export const DIRECTION_THRESHOLD = 0.62
/** Share of a group's members that must have a value for it to count as "shared". */
export const SHARED_SHARE = 0.75

export interface SharedValue {
  key: AttributeKey
  value: string
  label: string
  count: number
}

export interface TasteGroup {
  members: Watch[]
  /** Values most members have in common (observable values only). */
  shared: SharedValue[]
}

/**
 * Groups liked watches into taste directions with deterministic
 * average-linkage clustering. Nothing is averaged away: a person who likes
 * both slim gold dress watches and chunky blue divers gets two groups,
 * not one blurred "gold diver" profile.
 *
 * Returns every group (singletons included), largest first; ties keep the
 * order in which the first member was liked.
 */
export function groupLikes(likes: Watch[], sim: SimilarityIndex): TasteGroup[] {
  let clusters: Watch[][] = likes.map((w) => [w])
  const avg = (a: Watch[], b: Watch[]) => {
    let total = 0
    for (const x of a) for (const y of b) total += sim.get(x.id, y.id)
    return total / (a.length * b.length)
  }
  for (;;) {
    let best = -1
    let bi = -1
    let bj = -1
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = avg(clusters[i], clusters[j])
        if (s > best + 1e-12) {
          best = s
          bi = i
          bj = j
        }
      }
    }
    if (bi < 0 || best < DIRECTION_THRESHOLD) break
    const merged = [...clusters[bi], ...clusters[bj]]
    clusters = clusters.filter((_, k) => k !== bi && k !== bj)
    clusters.splice(bi, 0, merged)
  }
  const order = new Map(likes.map((w, i) => [w.id, i]))
  for (const c of clusters) c.sort((x, y) => order.get(x.id)! - order.get(y.id)!)
  clusters.sort((a, b) => b.length - a.length || order.get(a[0].id)! - order.get(b[0].id)!)
  return clusters.map((members) => ({ members, shared: sharedValues(members) }))
}

/** Observable attribute values present in at least SHARED_SHARE of the watches (min 2). */
export function sharedValues(members: Watch[], share = SHARED_SHARE): SharedValue[] {
  if (members.length < 2) return describeSingle(members[0])
  const out: SharedValue[] = []
  for (const key of ATTRIBUTE_KEYS) {
    const counts = new Map<string, number>()
    for (const w of members) {
      const v = w.attributes[key] as string | string[]
      for (const item of Array.isArray(v) ? v : [v]) counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    for (const [value, count] of counts) {
      const def = valueDef(key, value)
      if (!def || def.observable === false) continue
      if (count >= 2 && count / members.length >= share) out.push({ key, value, label: def.label, count })
    }
  }
  return out.sort((a, b) => attributeDef(b.key).weight - attributeDef(a.key).weight || b.count - a.count)
}

function describeSingle(w: Watch | undefined): SharedValue[] {
  if (!w) return []
  const out: SharedValue[] = []
  for (const key of ATTRIBUTE_KEYS) {
    const v = w.attributes[key] as string | string[]
    for (const item of Array.isArray(v) ? v : [v]) {
      const def = valueDef(key, item)
      if (def && def.observable !== false) out.push({ key, value: item, label: def.label, count: 1 })
    }
  }
  return out.sort((a, b) => attributeDef(b.key).weight - attributeDef(a.key).weight)
}

/** Short, purely descriptive title — never a personality label. */
export function groupTitle(group: TasteGroup, max = 3): string {
  const labels = group.shared.slice(0, max).map((s) => s.label)
  return labels.length ? labels.join(' · ') : 'A varied mix'
}
