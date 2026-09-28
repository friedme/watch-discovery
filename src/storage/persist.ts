import type { Choice, CollectionId, SessionData, Vote } from '../domain/types'

const VERSION = 1
const CHOICES: Choice[] = ['yay', 'nay', 'pass']
const COLLECTIONS: CollectionId[] = ['men', 'women', 'all']

export function storageKey(demo: boolean): string {
  return demo ? 'watch-discovery/v1/demo' : 'watch-discovery/v1'
}

interface Stored {
  version: number
  sessions: SessionData[]
}

/**
 * Reads sessions from localStorage. Anything unreadable is dropped rather
 * than crashing the app; the result is always a clean, de-duplicated list.
 */
export function loadSessions(storage: Storage | undefined, key: string): SessionData[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (!parsed || !Array.isArray(parsed.sessions)) return []
    return parsed.sessions.map(sanitizeSession).filter((s): s is SessionData => s !== null)
  } catch {
    return []
  }
}

/** Returns false when the browser refuses to store (private mode, quota, blocked). */
export function saveSessions(storage: Storage | undefined, key: string, sessions: SessionData[]): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify({ version: VERSION, sessions } satisfies Stored))
    return true
  } catch {
    return false
  }
}

export function safeLocalStorage(): Storage | undefined {
  try {
    const s = window.localStorage
    const probe = '__watch-discovery-probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return undefined
  }
}

export function sanitizeSession(input: unknown): SessionData | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  if (typeof s.id !== 'string' || !s.id) return null
  if (!COLLECTIONS.includes(s.collection as CollectionId)) return null
  const seed = Number(s.seed)
  if (!Number.isFinite(seed)) return null
  const votes = sanitizeVotes(s.votes)
  const continuedAt = Array.isArray(s.continuedAt)
    ? [...new Set(s.continuedAt.map(Number).filter((n) => Number.isInteger(n) && n >= 0))]
    : []
  const createdAt = Number(s.createdAt) || 0
  return {
    id: s.id,
    name: typeof s.name === 'string' ? s.name.slice(0, 60) : '',
    collection: s.collection as CollectionId,
    seed: seed >>> 0,
    createdAt,
    updatedAt: Number(s.updatedAt) || createdAt,
    votes,
    continuedAt,
    ...(typeof s.reference === 'string' && s.reference ? { reference: s.reference.slice(0, 60) } : {}),
    ...(s.demo === true ? { demo: true } : {}),
    ...(Number(s.importedAt) ? { importedAt: Number(s.importedAt) } : {}),
  }
}

/** Keeps well-formed votes, first reaction per watch only. */
export function sanitizeVotes(input: unknown): Vote[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: Vote[] = []
  for (const v of input) {
    if (!v || typeof v !== 'object') continue
    const { watchId, choice, at } = v as Record<string, unknown>
    if (typeof watchId !== 'string' || !watchId || seen.has(watchId)) continue
    if (!CHOICES.includes(choice as Choice)) continue
    seen.add(watchId)
    out.push({ watchId, choice: choice as Choice, at: Number(at) || 0 })
  }
  return out
}
