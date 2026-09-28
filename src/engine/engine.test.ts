import { describe, expect, it } from 'vitest'
import type { Choice, SessionData, Vote } from '../domain/types'
import { makeWatch, sampleWatches, vote } from '../test/fixtures'
import { createEngine, interleaveOpenings, resolveOpening } from './context'
import { groupLikes } from './directions'
import { MIN_DECISIVE_FOR_OBSERVATIONS } from './observations'
import { buildProfile } from './profile'
import { recommend } from './recommendations'
import { mulberry32 } from './rng'
import { ADAPTIVE_SCHEDULE, nextPick, turnsBefore } from './selection'
import { applyAction, createSession, deriveScreen, ROUND_SIZE } from './session'
import { computeStats } from './stats'

const watches = sampleWatches()
const openingIds = ['dress-1', 'diver-1', 'digital-1', 'jewel-1', 'pilot-1', 'minimal-1']

function engineWith(seed = 42, opening = openingIds) {
  return createEngine(watches, resolveOpening(opening.map((id) => [id]), watches), seed)
}

function newSession(): SessionData {
  return createSession({ id: 's1', name: 'Test', collection: 'all', seed: 42, now: 0 })
}

/** Votes through the session, choosing via `choose` for each card shown. */
function play(engine = engineWith(), count: number, choose: (watchId: string, i: number) => Choice, start = newSession()) {
  let session = start
  for (let i = 0; i < count; i++) {
    let screen = deriveScreen(engine, session)
    if (screen.kind === 'checkpoint') {
      session = applyAction(engine, session, { type: 'continue', at: i })
      screen = deriveScreen(engine, session)
    }
    if (screen.kind !== 'vote') break
    const id = screen.pick.watch.id
    session = applyAction(engine, session, { type: 'vote', watchId: id, choice: choose(id, i), at: i })
  }
  return session
}

const likeDressAndDivers = (id: string): Choice => (id.startsWith('dress') || id.startsWith('diver') ? 'yay' : 'nay')

describe('opening round', () => {
  it('shows the curated opening round first, in order', () => {
    const engine = engineWith()
    const session = play(engine, openingIds.length, () => 'nay')
    expect(session.votes.map((v) => v.watchId)).toEqual(openingIds)
  })

  it('uses the first playable alternative in each slot and skips empty slots', () => {
    const opening = resolveOpening([['missing', 'dress-1'], ['missing-too'], ['dress-1', 'diver-1'], ['pilot-1']], watches)
    expect(opening.map((w) => w.id)).toEqual(['dress-1', 'diver-1', 'pilot-1'])
  })

  it('interleaves two openings without duplicates', () => {
    const a = resolveOpening([['dress-1'], ['diver-1'], ['pilot-1']], watches)
    const b = resolveOpening([['jewel-1'], ['diver-1'], ['minimal-1']], watches)
    expect(interleaveOpenings(a, b, 3).map((w) => w.id)).toEqual(['dress-1', 'jewel-1', 'diver-1', 'pilot-1', 'minimal-1'])
  })

  it('pauses at a checkpoint after the opening round and after each adaptive round', () => {
    const engine = engineWith()
    let session = newSession()
    for (const id of openingIds) session = applyAction(engine, session, { type: 'vote', watchId: id, choice: 'yay', at: 1 })
    expect(deriveScreen(engine, session)).toMatchObject({ kind: 'checkpoint', after: 'opening' })
    session = applyAction(engine, session, { type: 'continue', at: 2 })
    expect(deriveScreen(engine, session).kind).toBe('vote')
    for (let i = 0; i < ROUND_SIZE; i++) {
      const screen = deriveScreen(engine, session)
      if (screen.kind !== 'vote') throw new Error('expected a card')
      expect(screen.progress).toMatchObject({ phase: 'adaptive', index: i + 1, round: 1 })
      session = applyAction(engine, session, { type: 'vote', watchId: screen.pick.watch.id, choice: 'nay', at: 3 })
    }
    expect(deriveScreen(engine, session)).toMatchObject({ kind: 'checkpoint', after: 'round' })
  })

  it('finishes when every watch has been seen', () => {
    const engine = engineWith()
    const session = play(engine, watches.length + 5, () => 'pass')
    expect(new Set(session.votes.map((v) => v.watchId)).size).toBe(watches.length)
    expect(deriveScreen(engine, session).kind).toBe('finished')
  })
})

describe('undo', () => {
  it('restores exactly the previous state after any vote', () => {
    const engine = engineWith(7)
    const rng = mulberry32(99)
    const choices: Choice[] = ['yay', 'nay', 'pass']
    let session = newSession()
    for (let i = 0; i < watches.length - 1; i++) {
      let screen = deriveScreen(engine, session)
      if (screen.kind === 'checkpoint') {
        session = applyAction(engine, session, { type: 'continue', at: i })
        screen = deriveScreen(engine, session)
      }
      if (screen.kind !== 'vote') break
      const beforeScreen = screen
      const beforeProfile = buildProfile(engine, session.votes)
      const choice = choices[Math.floor(rng() * 3)]
      const voted = applyAction(engine, session, { type: 'vote', watchId: screen.pick.watch.id, choice, at: i })
      const undone = applyAction(engine, voted, { type: 'undo', at: i + 0.5 })

      expect(undone.votes).toEqual(session.votes)
      expect(undone.continuedAt).toEqual(session.continuedAt)
      expect(deriveScreen(engine, undone)).toEqual(beforeScreen)
      expect(buildProfile(engine, undone.votes)).toEqual(beforeProfile)

      session = voted
    }
  })

  it('brings back the card that was just voted on', () => {
    const engine = engineWith()
    const session = play(engine, 9, likeDressAndDivers)
    const last = session.votes.at(-1)!
    const undone = applyAction(engine, session, { type: 'undo', at: 99 })
    const screen = deriveScreen(engine, undone)
    expect(screen.kind).toBe('vote')
    if (screen.kind === 'vote') expect(screen.pick.watch.id).toBe(last.watchId)
  })

  it('does nothing with no votes', () => {
    const engine = engineWith()
    const session = newSession()
    expect(applyAction(engine, session, { type: 'undo', at: 1 })).toBe(session)
  })
})

describe('pass is neutral', () => {
  it('has no effect on stats, groups, observations or suggestions', () => {
    const engine = engineWith(3)
    const withPasses = play(engine, watches.length, (id, i) => (i % 3 === 2 ? 'pass' : likeDressAndDivers(id)))
    const passed = new Set(withPasses.votes.filter((v) => v.choice === 'pass').map((v) => v.watchId))
    expect(passed.size).toBeGreaterThan(3)
    const withoutPasses: Vote[] = withPasses.votes.filter((v) => v.choice !== 'pass')

    const a = buildProfile(engine, withPasses.votes)
    const b = buildProfile(engine, withoutPasses)
    expect(a.stats.byValue).toEqual(b.stats.byValue)
    expect(a.favourites).toEqual(b.favourites)
    expect(a.stats.nays).toEqual(b.stats.nays)
    expect(a.directions).toEqual(b.directions)
    expect(a.oneOffs).toEqual(b.oneOffs)
    expect(a.observations).toEqual(b.observations)

    // A passed watch only counts as "already seen".
    const statsB = computeStats(engine, withoutPasses)
    for (const id of passed) statsB.seen.add(id)
    statsB.reactions = computeStats(engine, withPasses.votes).reactions
    expect(recommend(engine, statsB, groupLikes(statsB.yays, engine.sim))).toEqual(a.recommendations)
  })

  it('a pass-only session produces no preferences at all', () => {
    const engine = engineWith()
    const session = play(engine, 10, () => 'pass')
    const profile = buildProfile(engine, session.votes)
    expect(profile.stats.decisive).toBe(0)
    expect(profile.stats.byValue.size).toBe(0)
    expect(profile.favourites).toEqual([])
    expect(profile.directions).toEqual([])
    expect(profile.observations).toEqual([])
    expect(profile.recommendations.every((r) => r.kind === 'wildcard')).toBe(true)
  })
})

describe('adaptive exploration', () => {
  it('is deterministic for the same seed and votes', () => {
    const a = play(engineWith(11), 18, likeDressAndDivers)
    const b = play(engineWith(11), 18, likeDressAndDivers)
    expect(a.votes.map((v) => v.watchId)).toEqual(b.votes.map((v) => v.watchId))
  })

  it('follows the schedule, including wildcards', () => {
    const engine = engineWith(5)
    const session = play(engine, openingIds.length + ADAPTIVE_SCHEDULE.length, likeDressAndDivers)
    const strategies: string[] = []
    for (let n = openingIds.length; n < session.votes.length; n++) {
      strategies.push(nextPick(engine, session.votes.slice(0, n))!.strategy)
    }
    expect(strategies).toContain('wildcard')
    expect(strategies[5]).toBe('wildcard')
    expect(strategies.filter((s) => s === 'deepen').length).toBe(3)
  })

  it('rotates between distinct taste directions instead of collapsing into one', () => {
    const engine = engineWith(8)
    // Opening: likes dress-1 and diver-1 (two very different designs).
    const session = play(engine, openingIds.length, likeDressAndDivers)
    const groups = groupLikes(computeStats(engine, session.votes).yays, engine.sim)
    expect(groups.length).toBe(2)

    const deepened: number[] = []
    let votes = session.votes
    for (let i = 0; i < ADAPTIVE_SCHEDULE.length * 2; i++) {
      const pick = nextPick(engine, votes)!
      if (pick.strategy === 'deepen') deepened.push(pick.group!)
      votes = [...votes, vote(pick.watch.id, 'nay')]
    }
    expect(new Set(deepened)).toEqual(new Set([0, 1]))
  })

  it('counts deepen turns correctly', () => {
    expect(turnsBefore('deepen', 0)).toBe(0)
    expect(turnsBefore('deepen', 1)).toBe(1)
    expect(turnsBefore('deepen', 6)).toBe(3)
    expect(turnsBefore('wildcard', 12)).toBe(2)
  })

  it('ignores votes for watches that are no longer in the catalogue', () => {
    const engine = engineWith()
    const votes = [vote('removed-watch', 'yay'), vote('dress-1', 'yay')]
    const stats = computeStats(engine, votes)
    expect(stats.yay).toBe(1)
    expect(stats.seen.has('removed-watch')).toBe(false)
  })

  it('only accepts a vote for the card currently shown', () => {
    const engine = engineWith()
    const session = newSession()
    const after = applyAction(engine, session, { type: 'vote', watchId: 'diver-3', choice: 'yay', at: 1 })
    expect(after).toBe(session)
  })
})

describe('results', () => {
  const engine = engineWith(21)
  const session = play(engine, 20, likeDressAndDivers)
  const profile = buildProfile(engine, session.votes)
  const allText = [
    ...profile.observations.flatMap((o) => [o.text, o.confoundText ?? '']),
    ...profile.recommendations.map((r) => r.reason),
    ...profile.directions.map((d) => d.title),
  ]

  it('shows the actual liked watches as favourites', () => {
    const liked = session.votes.filter((v) => v.choice === 'yay').map((v) => v.watchId)
    expect(profile.favourites.map((w) => w.id)).toEqual(liked)
  })

  it('keeps both taste directions', () => {
    const kinds = profile.directions.map((d) => d.members[0].id.split('-')[0]).sort()
    expect(kinds).toEqual(['diver', 'dress'])
  })

  it('suggests unseen watches for every direction, plus a wildcard', () => {
    const seen = new Set(session.votes.map((v) => v.watchId))
    expect(profile.recommendations.every((r) => !seen.has(r.watch.id))).toBe(true)
    // Every "similar" suggestion is grounded in liked watches.
    for (const r of profile.recommendations.filter((r) => r.kind === 'similar')) {
      expect(r.because.length).toBeGreaterThan(0)
      for (const w of r.because) expect(profile.favourites).toContain(w)
    }
  })

  it('grounds observations in counts, never percentages or labels', () => {
    expect(profile.observations.length).toBeGreaterThan(0)
    for (const text of allText) {
      expect(text).not.toMatch(/%|percent|match score|you are an?\b|personality|type of person/i)
    }
    for (const o of profile.observations) {
      expect(o.text).toMatch(/\d/)
      const examples = o.kind === 'less' ? o.dislikedExamples : o.likedExamples
      expect(examples.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('stays quiet until there is enough evidence', () => {
    const early = play(engineWith(21), MIN_DECISIVE_FOR_OBSERVATIONS - 1, likeDressAndDivers)
    const p = buildProfile(engineWith(21), early.votes)
    expect(p.observations).toEqual([])
    expect(p.confidence).toBe('early')
  })

  it('reports clear likes and dislikes with their counts', () => {
    const e = createEngine(watches, [], 1)
    const votes = [
      ...['dress-1', 'dress-2', 'dress-3', 'dress-4'].map((id) => vote(id, 'yay')),
      ...['diver-1', 'diver-2', 'diver-3', 'diver-4', 'digital-1', 'smart-1'].map((id) => vote(id, 'nay')),
    ]
    const p = buildProfile(e, votes)
    const drawn = p.observations.filter((o) => o.kind === 'drawn')
    const less = p.observations.filter((o) => o.kind === 'less')
    expect(drawn.map((o) => o.text)).toContain('You said Yay to all 4 watches in a dressy, slim style.')
    expect(less.some((o) => o.text.startsWith('You said Nay to all 4 watches'))).toBe(true)
  })

  it('flags when two traits always appeared together', () => {
    const e = createEngine(
      [
        ...['a', 'b', 'c'].map((id) => makeWatch(id, { dialColour: 'blue', band: 'rubber' })),
        ...['d', 'e', 'f', 'g', 'h'].map((id) => makeWatch(id, { dialColour: 'black', band: 'leather' })),
        makeWatch('i', { dialColour: 'white' }),
        makeWatch('j', { dialColour: 'white', band: 'leather' }),
      ],
      [],
      1,
    )
    const votes = [...['a', 'b', 'c'].map((id) => vote(id, 'yay')), ...['d', 'e', 'f', 'g', 'h'].map((id) => vote(id, 'nay'))]
    const p = buildProfile(e, votes)
    const blue = p.observations.find((o) => o.key === 'dialColour' && o.value === 'blue')
    const rubber = p.observations.find((o) => o.key === 'band' && o.value === 'rubber')
    // One of the two is reported, and it says the other always came with it.
    const reported = blue ?? rubber
    expect(reported?.confoundText).toMatch(/All 3 you liked were also watches (on a rubber strap|with a blue face), so it could be either\./)
    expect(blue && rubber).toBeFalsy()
  })
})
