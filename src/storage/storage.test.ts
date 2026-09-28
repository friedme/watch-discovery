import { describe, expect, it } from 'vitest'
import type { SessionData } from '../domain/types'
import { loadSessions, sanitizeSession, sanitizeVotes, saveSessions } from './persist'
import { decodeSession, encodeSession, importCodeFromHash, importCodeFromText, shareLink } from './share'

const session: SessionData = {
  id: 'abc',
  name: 'Zoë',
  collection: 'men',
  seed: 12345,
  createdAt: 1000,
  updatedAt: 2000,
  votes: [
    { watchId: 'cartier-tank', choice: 'yay', at: 1001 },
    { watchId: 'rolex-submariner', choice: 'nay', at: 1002 },
    { watchId: 'casio-f91w', choice: 'pass', at: 1003 },
  ],
  continuedAt: [20],
}

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

describe('local persistence', () => {
  it('round-trips sessions', () => {
    const storage = memoryStorage()
    expect(saveSessions(storage, 'k', [session])).toBe(true)
    expect(loadSessions(storage, 'k')).toEqual([session])
  })

  it('survives corrupted or foreign data', () => {
    const storage = memoryStorage()
    storage.setItem('k', '{not json')
    expect(loadSessions(storage, 'k')).toEqual([])
    storage.setItem('k', JSON.stringify({ sessions: [{ id: 'x', collection: 'nope', seed: 1 }, null, 42] }))
    expect(loadSessions(storage, 'k')).toEqual([])
    expect(loadSessions(undefined, 'k')).toEqual([])
  })

  it('reports when the browser refuses to store', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceeded')
    }
    expect(saveSessions(storage, 'k', [session])).toBe(false)
  })

  it('drops malformed and repeated votes', () => {
    expect(
      sanitizeVotes([
        { watchId: 'a', choice: 'yay', at: 1 },
        { watchId: 'a', choice: 'nay', at: 2 },
        { watchId: 'b', choice: 'maybe', at: 3 },
        { choice: 'yay' },
        null,
        { watchId: 'c', choice: 'pass' },
      ]),
    ).toEqual([
      { watchId: 'a', choice: 'yay', at: 1 },
      { watchId: 'c', choice: 'pass', at: 0 },
    ])
  })

  it('rejects sessions without id or with an unknown collection', () => {
    expect(sanitizeSession({ ...session, id: '' })).toBeNull()
    expect(sanitizeSession({ ...session, collection: 'kids' })).toBeNull()
  })
})

describe('share links', () => {
  it('round-trips a session through a link (including non-ASCII names)', () => {
    const link = shareLink(session, { origin: 'http://192.168.1.20:5173', pathname: '/', search: '' })
    expect(link.startsWith('http://192.168.1.20:5173/#import=')).toBe(true)
    const code = importCodeFromHash(new URL(link).hash)!
    const imported = decodeSession(code, 'new-id', 5000)!
    expect(imported.id).toBe('new-id')
    expect(imported.name).toBe('Zoë')
    expect(imported.collection).toBe('men')
    expect(imported.seed).toBe(12345)
    expect(imported.votes.map((v) => [v.watchId, v.choice])).toEqual(session.votes.map((v) => [v.watchId, v.choice]))
    expect(imported.continuedAt).toEqual([20])
    expect(imported.importedAt).toBe(5000)
  })

  it('keeps links short enough for messaging apps', () => {
    const many: SessionData = {
      ...session,
      votes: Array.from({ length: 80 }, (_, i) => ({ watchId: `some-watch-name-${i}`, choice: 'yay' as const, at: i })),
    }
    expect(encodeSession(many).length).toBeLessThan(4000)
  })

  it('ignores malformed codes', () => {
    expect(decodeSession('!!!', 'x', 1)).toBeNull()
    expect(decodeSession(btoa('{"v":2}'), 'x', 1)).toBeNull()
    expect(importCodeFromHash('#/results/abc')).toBeNull()
  })

  it('finds the code in pasted text: a link inside a message, or the bare code', () => {
    const code = encodeSession(session)
    const link = shareLink(session, { origin: 'https://example.org', pathname: '/', search: '' })
    expect(importCodeFromText(`Here are my results: ${link} — have a look`)).toBe(code)
    expect(importCodeFromText(`  ${code}\n`)).toBe(code)
    expect(importCodeFromText('hello there')).toBeNull()
    expect(importCodeFromText('')).toBeNull()
  })
})
