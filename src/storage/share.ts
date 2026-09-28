import type { Choice, CollectionId, SessionData } from '../domain/types'
import { sanitizeSession } from './persist'

/**
 * Sessions travel between devices as a link: the whole session is encoded
 * in the URL fragment (#import=…). Fragments are never sent to a server, so
 * this works without any backend and nothing leaves the two devices.
 */
const PREFIX = '#import='
const CODE: Record<Choice, string> = { yay: 'y', nay: 'n', pass: 'p' }
const DECODE: Record<string, Choice> = { y: 'yay', n: 'nay', p: 'pass' }

interface Portable {
  v: 1
  n: string
  c: CollectionId
  s: number
  t: number
  /** "watchId:y,watchId:n,…" */
  r: string
  k: number[]
  /** Reference taste of the second round, if any. */
  f?: string
}

export function encodeSession(session: SessionData): string {
  const portable: Portable = {
    v: 1,
    n: session.name,
    c: session.collection,
    s: session.seed,
    t: session.createdAt,
    r: session.votes.map((v) => `${v.watchId}:${CODE[v.choice]}`).join(','),
    k: session.continuedAt,
    ...(session.reference ? { f: session.reference } : {}),
  }
  return toBase64Url(JSON.stringify(portable))
}

export function shareLink(session: SessionData, location: { origin: string; pathname: string; search: string }): string {
  return `${location.origin}${location.pathname}${location.search}${PREFIX}${encodeSession(session)}`
}

export function importCodeFromHash(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null
}

/** Decodes a shared session; returns null for anything malformed. */
export function decodeSession(code: string, newId: string, now: number): SessionData | null {
  try {
    const p = JSON.parse(fromBase64Url(code)) as Partial<Portable>
    if (p.v !== 1 || typeof p.r !== 'string') return null
    const votes = p.r
      ? p.r.split(',').map((pair, i) => {
          const at = pair.lastIndexOf(':')
          return { watchId: pair.slice(0, at), choice: DECODE[pair.slice(at + 1)], at: (Number(p.t) || 0) + i }
        })
      : []
    return sanitizeSession({
      id: newId,
      name: p.n,
      collection: p.c,
      seed: p.s,
      createdAt: p.t,
      updatedAt: now,
      votes,
      continuedAt: p.k,
      reference: p.f,
      importedAt: now,
    })
  } catch {
    return null
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
