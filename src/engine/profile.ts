import type { Vote, Watch } from '../domain/types'
import type { Engine } from './context'
import { groupLikes, groupTitle } from './directions'
import type { TasteGroup } from './directions'
import { computeObservations, MIN_DECISIVE_FOR_OBSERVATIONS } from './observations'
import type { Observation } from './observations'
import { recommend } from './recommendations'
import type { Recommendation } from './recommendations'
import { computeStats } from './stats'
import type { Stats } from './stats'

export interface Direction extends TasteGroup {
  title: string
}

export interface Profile {
  stats: Stats
  /** The watches actually liked, in the order they were liked. */
  favourites: Watch[]
  /** Liked groups with at least two members: distinct taste directions. */
  directions: Direction[]
  /** Liked watches that don't (yet) belong to a direction. */
  oneOffs: Watch[]
  observations: Observation[]
  recommendations: Recommendation[]
  /** "early" = observations not shown yet; "tentative" = shown with extra caution. */
  confidence: 'early' | 'tentative' | 'settled'
}

export function buildProfile(engine: Engine, votes: readonly Vote[], nameOf?: (w: Watch) => string): Profile {
  const stats = computeStats(engine, votes)
  const groups = groupLikes(stats.yays, engine.sim)
  const directions = groups.filter((g) => g.members.length >= 2).map((g) => ({ ...g, title: groupTitle(g) }))
  const oneOffs = groups.filter((g) => g.members.length === 1).map((g) => g.members[0])
  return {
    stats,
    favourites: stats.yays,
    directions,
    oneOffs,
    observations: computeObservations(engine, stats),
    recommendations: recommend(engine, stats, groups, { nameOf }),
    confidence:
      stats.decisive < MIN_DECISIVE_FOR_OBSERVATIONS ? 'early' : stats.decisive < 20 ? 'tentative' : 'settled',
  }
}
