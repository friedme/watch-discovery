/**
 * A reference taste: someone's declared watch preferences (e.g. from their
 * own notes), used only to compare with another person's blind reactions.
 * It never labels cards and never steers the opening round or exploration;
 * its watches can optionally be shown in an unlabelled second round.
 */
export type Stance = 'owned' | 'likes' | 'unsure' | 'dislikes'

export const STANCES: Stance[] = ['owned', 'likes', 'unsure', 'dislikes']

export interface ReferenceWatch {
  id: string
  stance: Stance
  /** Key into `directions`. */
  direction?: string
  note?: string
}

export interface ReferenceProfile {
  id: string
  /** Whose taste this is, as used in sentences: "you" or a first name. */
  owner: string
  /** Short name for the list, e.g. "watch notes". */
  title: string
  /** Example profiles only appear in demo mode. */
  demoOnly?: boolean
  /** The owner's own names for their taste directions. */
  directions?: Record<string, string>
  watches: ReferenceWatch[]
}

/** "your" for "you", otherwise "Name's". */
export function possessive(owner: string): string {
  return owner.trim().toLowerCase() === 'you' ? 'your' : `${owner.trim()}'s`
}

export function listName(profile: ReferenceProfile): string {
  return `${possessive(profile.owner)} ${profile.title}`
}

export const STANCE_LABEL: Record<Stance, string> = {
  owned: 'Owned',
  likes: 'On the list',
  unsure: 'A maybe',
  dislikes: 'Ruled out',
}

/**
 * Watches in priority order for the second round: owned first, then liked,
 * ruled-out and maybe watches taking turns, so that a long list that gets
 * capped still keeps its contrasts (the ruled-out ones are the most telling).
 */
export function prioritized(profile: ReferenceProfile): ReferenceWatch[] {
  const of = (stance: Stance) => profile.watches.filter((w) => w.stance === stance)
  const queues = [of('likes'), of('dislikes'), of('unsure')]
  const out = of('owned')
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!)
  return out
}

/** Returns problems with a profile (empty when valid). */
export function validateProfile(p: unknown, knownIds: Set<string>): string[] {
  const problems: string[] = []
  if (!p || typeof p !== 'object') return ['profile is not an object']
  const r = p as Partial<ReferenceProfile>
  if (!r.id || typeof r.id !== 'string') problems.push('id missing')
  if (!r.owner || typeof r.owner !== 'string') problems.push('owner missing')
  if (!r.title || typeof r.title !== 'string') problems.push('title missing')
  if (!Array.isArray(r.watches)) return [...problems, 'watches must be a list']
  const seen = new Set<string>()
  for (const w of r.watches) {
    if (!knownIds.has(w.id)) problems.push(`unknown watch "${w.id}"`)
    if (seen.has(w.id)) problems.push(`"${w.id}" listed twice`)
    seen.add(w.id)
    if (!STANCES.includes(w.stance)) problems.push(`"${w.id}": unknown stance "${String(w.stance)}"`)
    if (w.direction && !r.directions?.[w.direction]) problems.push(`"${w.id}": unknown direction "${w.direction}"`)
  }
  return problems
}

/**
 * Keeps a structurally valid profile, dropping individual entries that don't
 * match the catalogue (e.g. a typo) instead of discarding the whole profile.
 */
export function sanitizeProfile(p: unknown, knownIds: Set<string>): ReferenceProfile | null {
  if (!p || typeof p !== 'object') return null
  const r = p as Partial<ReferenceProfile>
  if (typeof r.id !== 'string' || !r.id || typeof r.owner !== 'string' || typeof r.title !== 'string' || !Array.isArray(r.watches)) return null
  const directions = r.directions && typeof r.directions === 'object' ? r.directions : undefined
  const seen = new Set<string>()
  const watches = r.watches.filter((w) => {
    if (!w || !knownIds.has(w.id) || seen.has(w.id) || !STANCES.includes(w.stance)) return false
    seen.add(w.id)
    return true
  })
  return {
    id: r.id,
    owner: r.owner,
    title: r.title,
    ...(r.demoOnly ? { demoOnly: true } : {}),
    ...(directions ? { directions } : {}),
    watches: watches.map((w) => ({ ...w, direction: w.direction && directions?.[w.direction] ? w.direction : undefined })),
  }
}
