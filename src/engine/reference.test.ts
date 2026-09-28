import { describe, expect, it } from 'vitest'
import type { ReferenceProfile } from '../domain/reference'
import { prioritized, validateProfile } from '../domain/reference'
import type { Stance } from '../domain/reference'
import { sampleWatches, vote } from '../test/fixtures'
import { buildSecondRound, createEngine, resolveOpening } from './context'
import { buildProfile } from './profile'
import { buildReferenceReport } from './reference'
import { nextPick } from './selection'
import { applyAction, createSession, deriveScreen } from './session'
import { SimilarityIndex } from './similarity'

const watches = sampleWatches()
const sim = new SimilarityIndex(watches)
const opening = resolveOpening([['dress-1'], ['digital-1'], ['jewel-1'], ['pilot-1']], watches)

const profile: ReferenceProfile = {
  id: 'test',
  owner: 'Sam',
  title: 'notes',
  directions: { sporty: 'Sporty and blue', dressy: 'Slim and dressy' },
  watches: [
    { id: 'diver-1', stance: 'owned', direction: 'sporty' },
    { id: 'diver-2', stance: 'likes', direction: 'sporty' },
    { id: 'diver-3', stance: 'likes', direction: 'sporty' },
    { id: 'dress-2', stance: 'likes', direction: 'dressy' },
    { id: 'integrated-1', stance: 'unsure' },
    { id: 'smart-1', stance: 'dislikes' },
    { id: 'playful-1', stance: 'dislikes' },
    { id: 'not-in-pool', stance: 'likes' },
  ],
}
const ids = prioritized(profile).map((w) => w.id)

describe('second round', () => {
  const second = buildSecondRound(watches, opening, ids, 7, sim)
  const engine = createEngine(watches, opening, 7, sim, second)

  it('shows every available listed watch, unlabelled, mixed with lookalikes that are not on the list', () => {
    const listed = second.filter((w) => ids.includes(w.id)).map((w) => w.id)
    expect(new Set(listed)).toEqual(new Set(['diver-1', 'diver-2', 'diver-3', 'dress-2', 'integrated-1', 'smart-1', 'playful-1']))
    const lookalikes = second.filter((w) => !ids.includes(w.id))
    expect(lookalikes.length).toBeGreaterThan(0)
    // Never repeats an opening card.
    for (const w of second) expect(opening.map((o) => o.id)).not.toContain(w.id)
  })

  it('is deterministic for a seed and shuffled across seeds', () => {
    expect(buildSecondRound(watches, opening, ids, 7, sim)).toEqual(second)
    const orders = new Set([1, 2, 3, 4, 5].map((s) => buildSecondRound(watches, opening, ids, s, sim).map((w) => w.id).join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('comes after the opening round, with its own checkpoint, and undo still works', () => {
    let session = createSession({ id: 's', name: 'Ann', collection: 'all', seed: 7, now: 0 })
    const phases: string[] = []
    for (let i = 0; i < opening.length + second.length + 1; i++) {
      let screen = deriveScreen(engine, session)
      if (screen.kind === 'checkpoint') {
        phases.push(`checkpoint:${screen.after}`)
        session = applyAction(engine, session, { type: 'continue', at: i })
        screen = deriveScreen(engine, session)
      }
      if (screen.kind !== 'vote') break
      phases.push(screen.progress.phase)
      const before = screen
      const voted = applyAction(engine, session, { type: 'vote', watchId: screen.pick.watch.id, choice: 'yay', at: i })
      expect(deriveScreen(engine, applyAction(engine, voted, { type: 'undo', at: i }))).toEqual(before)
      session = voted
    }
    expect(phases.filter((p) => p === 'opening')).toHaveLength(opening.length)
    expect(phases.filter((p) => p === 'second')).toHaveLength(second.length)
    expect(phases).toContain('checkpoint:opening')
    expect(phases).toContain('checkpoint:second')
    expect(phases.indexOf('checkpoint:second')).toBeGreaterThan(phases.lastIndexOf('second'))
    expect(phases.at(-1)).toBe('adaptive')
  })

  it('never influences anything without the option', () => {
    const plain = createEngine(watches, opening, 7, sim)
    expect(plain.second).toEqual([])
    expect(nextPick(plain, opening.map((w) => vote(w.id, 'nay')))?.phase).toBe('adaptive')
  })
})

describe('reference report', () => {
  const engine = createEngine(watches, opening, 3, sim)
  const votes = [
    vote('diver-1', 'yay'),
    vote('diver-2', 'nay'),
    vote('dress-2', 'yay'),
    vote('integrated-1', 'yay'),
    vote('smart-1', 'yay'),
    vote('playful-1', 'nay'),
    vote('diver-4', 'yay'),
    vote('diver-5', 'yay'),
    vote('minimal-1', 'yay'),
    vote('field-1', 'nay'),
    vote('diver-3', 'pass'),
  ]
  const report = buildReferenceReport(engine, votes, profile, buildProfile(engine, votes).directions)

  it('sorts the listed watches by stance and reaction', () => {
    expect(report.listed).toBe(7)
    expect(report.notAvailable).toBe(1)
    expect(report.reacted).toBe(6)
    expect(report.agree.map((i) => i.watch.id)).toEqual(['diver-1', 'dress-2'])
    expect(report.differ.map((i) => i.watch.id)).toEqual(['diver-2'])
    expect(report.maybes.map((i) => [i.watch.id, i.choice])).toEqual([['integrated-1', 'yay']])
    expect(report.ruledOutButLiked.map((i) => i.watch.id)).toEqual(['smart-1'])
    expect(report.bothRuledOut.map((i) => i.watch.id)).toEqual(['playful-1'])
    expect(report.passed.map((i) => i.watch.id)).toEqual(['diver-3'])
  })

  it('counts reactions per declared direction', () => {
    const sporty = report.directions.find((d) => d.key === 'sporty')!
    expect([sporty.yay, sporty.nay]).toEqual([1, 1])
  })

  it('finds liked designs close to the list, grounded in a listed favourite', () => {
    const adjacent = report.adjacent.map((a) => a.watch.id)
    expect(adjacent).toContain('diver-4')
    expect(adjacent).not.toContain('diver-1') // already on the list
    for (const a of report.adjacent) expect(['diver-1', 'diver-2', 'diver-3', 'dress-2']).toContain(a.closest.id)
  })

  it('compares the traits most listed favourites share with her reactions to those traits', () => {
    const bracelet = report.traits.find((t) => t.key === 'band' && t.value === 'bracelet')
    expect(bracelet?.inList).toBeGreaterThanOrEqual(3)
    expect(bracelet!.yay + bracelet!.nay).toBeGreaterThan(0)
  })
})

describe('second-round priority', () => {
  it('puts owned watches first and lets liked, ruled-out and maybe watches take turns', () => {
    const stances = (s: Stance[]) => ({ ...profile, watches: s.map((stance, i) => ({ id: `w${i}`, stance })) })
    const order = prioritized(stances(['likes', 'likes', 'likes', 'dislikes', 'dislikes', 'unsure', 'owned'])).map((w) => w.stance)
    expect(order).toEqual(['owned', 'likes', 'dislikes', 'unsure', 'likes', 'dislikes', 'likes'])
  })
})

describe('profile validation', () => {
  it('flags unknown watches, stances and directions', () => {
    const known = new Set(watches.map((w) => w.id))
    expect(validateProfile(profile, known)).toEqual(['unknown watch "not-in-pool"'])
    const bad = { ...profile, watches: [{ id: 'diver-1', stance: 'loves', direction: 'x' }] }
    expect(validateProfile(bad, known)).toEqual(['"diver-1": unknown stance "loves"', '"diver-1": unknown direction "x"'])
  })
})
