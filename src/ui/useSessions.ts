import { useSyncExternalStore } from 'react'
import type { SessionData } from '../domain/types'
import { loadSessions, safeLocalStorage, saveSessions, storageKey } from '../storage/persist'

export interface SessionStore {
  sessions: SessionData[]
  /** False when this browser will not keep data (private mode, blocked storage). */
  persistent: boolean
  upsert: (session: SessionData) => void
  /** Applies a change to the latest stored version of a session (safe under rapid taps). */
  update: (id: string, change: (session: SessionData) => SessionData) => void
  remove: (id: string) => void
}

interface Snapshot {
  sessions: SessionData[]
  persistent: boolean
}

/** Sessions held outside React and written through to localStorage on every change. */
class SessionRepo {
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()
  private readonly storage: Storage | undefined
  private readonly key: string

  constructor(key: string) {
    this.key = key
    this.storage = safeLocalStorage()
    this.snapshot = { sessions: loadSessions(this.storage, key), persistent: this.storage !== undefined }
    window.addEventListener('storage', (e) => {
      // Another tab changed the data: pick it up.
      if (e.key === key) this.publish({ ...this.snapshot, sessions: loadSessions(this.storage, key) })
    })
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private commit(sessions: SessionData[]) {
    if (sessions === this.snapshot.sessions) return
    const saved = this.storage ? saveSessions(this.storage, this.key, sessions) : false
    this.publish({ sessions, persistent: this.snapshot.persistent && saved })
  }

  private publish(next: Snapshot) {
    this.snapshot = next
    for (const l of this.listeners) l()
  }

  upsert = (session: SessionData) => {
    const all = this.snapshot.sessions
    const i = all.findIndex((s) => s.id === session.id)
    if (i < 0) return this.commit([...all, session])
    if (all[i] === session) return
    this.commit(all.map((s, k) => (k === i ? session : s)))
  }

  update = (id: string, change: (session: SessionData) => SessionData) => {
    const all = this.snapshot.sessions
    const i = all.findIndex((s) => s.id === id)
    if (i < 0) return
    const changed = change(all[i])
    if (changed !== all[i]) this.commit(all.map((s, k) => (k === i ? changed : s)))
  }

  remove = (id: string) => this.commit(this.snapshot.sessions.filter((s) => s.id !== id))
}

const repos = new Map<string, SessionRepo>()

function repoFor(demo: boolean): SessionRepo {
  const key = storageKey(demo)
  let repo = repos.get(key)
  if (!repo) repos.set(key, (repo = new SessionRepo(key)))
  return repo
}

/** Test helper: forget cached repos so the next render re-reads storage. */
export function resetSessionRepos() {
  repos.clear()
}

export function useSessions(demo: boolean): SessionStore {
  const repo = repoFor(demo)
  const snapshot = useSyncExternalStore(repo.subscribe, repo.getSnapshot)
  return { ...snapshot, upsert: repo.upsert, update: repo.update, remove: repo.remove }
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 13)
  return Math.random().toString(36).slice(2, 15)
}
