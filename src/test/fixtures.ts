import type { WatchAttributes } from '../domain/taxonomy'
import type { Audience, Choice, Vote, Watch } from '../domain/types'

const BASE: WatchAttributes = {
  style: 'everyday',
  caseShape: 'round',
  caseColour: 'silver',
  dialColour: 'white',
  dialTexture: 'plain',
  band: 'bracelet',
  heft: 'balanced',
  busyness: 'moderate',
  markers: 'sticks',
  bezel: 'plain',
  era: 'classic',
  sparkle: 'none',
  features: [],
}

export function makeWatch(id: string, attrs: Partial<WatchAttributes> = {}, audiences: Audience[] = ['men', 'women']): Watch {
  return {
    id,
    brand: 'Test',
    model: id,
    audiences,
    attributes: { ...BASE, ...attrs },
    status: 'verified',
    image: {
      file: `watches/${id}.jpg`,
      width: 800,
      height: 800,
      usage: 'open-licence',
      source: {
        provider: 'wikimedia-commons',
        pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
        author: 'Tester',
        license: 'CC BY-SA 4.0',
        attributionRequired: true,
        credit: 'Tester, CC BY-SA 4.0',
        retrievedAt: '2026-01-01',
      },
      verification: { identity: 'model-family', checkedBy: 'test', checkedAt: '2026-01-01' },
    },
    imageUrl: `/watches/${id}.jpg`,
    displayName: `Test ${id}`,
  }
}

/** Two clearly distinct families plus assorted others. */
export function sampleWatches(): Watch[] {
  const dress = (id: string, extra: Partial<WatchAttributes> = {}) =>
    makeWatch(id, {
      style: 'dress',
      caseShape: 'rectangular',
      caseColour: 'gold',
      dialColour: 'white',
      band: 'leather',
      heft: 'delicate',
      busyness: 'clean',
      markers: 'roman',
      ...extra,
    })
  const diver = (id: string, extra: Partial<WatchAttributes> = {}) =>
    makeWatch(id, {
      style: 'sport-ring',
      caseShape: 'round',
      caseColour: 'silver',
      dialColour: 'blue',
      band: 'bracelet',
      heft: 'bold',
      bezel: 'numbered',
      era: 'modern',
      features: ['date'],
      ...extra,
    })
  return [
    dress('dress-1'),
    diver('diver-1'),
    makeWatch('digital-1', { style: 'digital', caseShape: 'square', caseColour: 'black', dialColour: 'screen', band: 'resin', markers: 'digital', era: 'modern' }),
    dress('dress-2', { caseColour: 'rose' }),
    diver('diver-2', { dialColour: 'black' }),
    makeWatch('jewel-1', { style: 'jewellery', caseShape: 'oval', caseColour: 'gold', dialColour: 'pearl', band: 'chain', heft: 'delicate', sparkle: 'lots', bezel: 'gems' }),
    dress('dress-3', { caseShape: 'square' }),
    diver('diver-3', { dialColour: 'green' }),
    makeWatch('pilot-1', { style: 'pilot', dialColour: 'black', band: 'leather', heft: 'bold', markers: 'arabic' }),
    dress('dress-4', { band: 'bracelet' }),
    diver('diver-4', { caseColour: 'two-tone' }),
    makeWatch('chrono-1', { style: 'chronograph', dialColour: 'black', busyness: 'busy', bezel: 'numbered', features: ['subdials'] }),
    makeWatch('smart-1', { style: 'smart', caseShape: 'square', caseColour: 'black', dialColour: 'screen', band: 'rubber', markers: 'digital', era: 'modern' }),
    dress('dress-5', { dialColour: 'champagne' }),
    diver('diver-5', { band: 'rubber' }),
    makeWatch('minimal-1', { style: 'minimalist', dialColour: 'white', band: 'mesh', heft: 'delicate', busyness: 'clean', markers: 'minimal', era: 'modern' }),
    makeWatch('field-1', { style: 'field', dialColour: 'black', band: 'fabric', markers: 'arabic' }),
    makeWatch('playful-1', { style: 'playful', caseColour: 'colour', dialColour: 'warm', band: 'resin', era: 'modern' }),
    dress('dress-6', { caseShape: 'round' }),
    diver('diver-6', { dialColour: 'grey' }),
    makeWatch('sculpt-1', { style: 'sculptural', caseShape: 'unusual', caseColour: 'black', dialColour: 'skeleton', band: 'rubber', busyness: 'busy', features: ['open'] }),
    makeWatch('integrated-1', { style: 'integrated', caseShape: 'octagon', dialColour: 'blue', bezel: 'decorative', era: 'modern' }),
  ]
}

let clock = 1_000
export function vote(watchId: string, choice: Choice): Vote {
  clock += 1
  return { watchId, choice, at: clock }
}
