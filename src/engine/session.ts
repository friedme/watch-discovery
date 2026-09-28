import type { Choice, CollectionId, SessionData } from '../domain/types'
import type { Engine } from './context'
import { nextPick } from './selection'
import type { Pick } from './selection'
import { computeStats } from './stats'

/** Cards per adaptive round between checkpoints. */
export const ROUND_SIZE = 12

export type SessionAction =
  | { type: 'vote'; watchId: string; choice: Choice; at: number }
  | { type: 'undo'; at: number }
  | { type: 'continue'; at: number }
  | { type: 'rename'; name: string; at: number }

export interface Progress {
  phase: 'opening' | 'second' | 'adaptive'
  /** 1-based position in the current round. */
  index: number
  total: number
  /** 1-based adaptive round number (0 during the opening round). */
  round: number
}

export type Screen =
  | { kind: 'vote'; pick: Pick; progress: Progress }
  | { kind: 'checkpoint'; after: 'opening' | 'second' | 'round'; seen: number }
  | { kind: 'finished' }

export function createSession(init: {
  id: string
  name: string
  collection: CollectionId
  seed: number
  now: number
  reference?: string
  demo?: boolean
}): SessionData {
  return {
    id: init.id,
    name: init.name.trim(),
    collection: init.collection,
    seed: init.seed,
    createdAt: init.now,
    updatedAt: init.now,
    votes: [],
    continuedAt: [],
    ...(init.reference ? { reference: init.reference } : {}),
    ...(init.demo ? { demo: true } : {}),
  }
}

/**
 * The session is an append-only vote log plus explicit "keep exploring"
 * decisions; every card, count and result is derived from it. Undo removes
 * the last vote and nothing else, so the derived state is exactly what it was
 * before that vote.
 */
export function applyAction(engine: Engine, session: SessionData, action: SessionAction): SessionData {
  switch (action.type) {
    case 'vote': {
      const screen = deriveScreen(engine, session)
      // Only the card currently on screen can be voted on (guards double taps).
      if (screen.kind !== 'vote' || screen.pick.watch.id !== action.watchId) return session
      return {
        ...session,
        votes: [...session.votes, { watchId: action.watchId, choice: action.choice, at: action.at }],
        updatedAt: action.at,
      }
    }
    case 'undo':
      if (!session.votes.length) return session
      return { ...session, votes: session.votes.slice(0, -1), updatedAt: action.at }
    case 'continue': {
      const seen = computeStats(engine, session.votes).seen.size
      if (session.continuedAt.includes(seen)) return session
      return { ...session, continuedAt: [...session.continuedAt, seen], updatedAt: action.at }
    }
    case 'rename':
      return { ...session, name: action.name.trim(), updatedAt: action.at }
  }
}

export function deriveScreen(engine: Engine, session: SessionData): Screen {
  const pick = nextPick(engine, session.votes)
  if (!pick) return { kind: 'finished' }
  const seen = computeStats(engine, session.votes).seen.size
  const after = checkpointAt(engine, seen)
  if (after && !session.continuedAt.includes(seen)) return { kind: 'checkpoint', after, seen }
  return { kind: 'vote', pick, progress: progressFor(engine, pick, seen) }
}

/** Pauses after the opening round, after the second round (if any), then every ROUND_SIZE cards. */
export function checkpointAt(engine: Engine, seen: number): 'opening' | 'second' | 'round' | null {
  const openingLength = engine.opening.length
  const fixedLength = engine.fixed.length
  if (seen === 0) return null
  if (seen === openingLength && openingLength > 0) return 'opening'
  if (seen === fixedLength && fixedLength > openingLength) return 'second'
  if (seen > fixedLength && (seen - fixedLength) % ROUND_SIZE === 0) return 'round'
  return null
}

function progressFor(engine: Engine, pick: Pick, seen: number): Progress {
  const openingLength = engine.opening.length
  if (pick.phase === 'opening') {
    return { phase: 'opening', index: Math.min(seen + 1, openingLength), total: openingLength, round: 0 }
  }
  if (pick.phase === 'second') {
    const total = engine.fixed.length - openingLength
    return { phase: 'second', index: Math.min(seen - openingLength + 1, total), total, round: 0 }
  }
  const adaptiveSeen = Math.max(0, seen - engine.fixed.length)
  const inRound = adaptiveSeen % ROUND_SIZE
  const remaining = engine.pool.length - seen
  return {
    phase: 'adaptive',
    index: inRound + 1,
    total: Math.min(ROUND_SIZE, inRound + remaining),
    round: Math.floor(adaptiveSeen / ROUND_SIZE) + 1,
  }
}
