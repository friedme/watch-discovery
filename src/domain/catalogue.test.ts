import { describe, expect, it } from 'vitest'
import { makeWatch } from '../test/fixtures'
import { demoCatalogue } from '../demo/demoCatalogue'
import { displayNameOf, engineFor, openingFor, poolFor, realCatalogue, toPlayable } from './catalogue'
import type { Catalogue } from './catalogue'
import type { CatalogueEntry } from './types'

function entry(id: string, overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const { imageUrl: _u, displayName: _d, ...w } = makeWatch(id)
  return { ...w, ...overrides } as CatalogueEntry
}

describe('playable watches', () => {
  it('never includes wanted entries or photos without documented rights', () => {
    const good = entry('good')
    const wanted = entry('wanted', { status: 'wanted' })
    const noImage = entry('no-image', { image: undefined })
    const noLicence = entry('no-licence', { image: { ...good.image!, source: { ...good.image!.source, license: '' } } })
    const unchecked = entry('unchecked', { image: { ...good.image!, verification: { ...good.image!.verification, checkedBy: '' } } })
    const badAttrs = entry('bad-attrs', { attributes: { ...good.attributes, band: 'string' as never } })
    const playable = toPlayable([good, wanted, noImage, noLicence, unchecked, badAttrs], (f) => `/${f}`)
    expect(playable.map((w) => w.id)).toEqual(['good'])
    expect(playable[0].imageUrl).toBe('/watches/good.jpg')
  })

  it('never names more than the photo check supports', () => {
    const e = entry('x', { brand: 'Seiko', model: 'SKX007' })
    expect(displayNameOf(e)).toBe('Seiko SKX007')
    const brandOnly = entry('y', { brand: 'Seiko', model: 'SKX007', image: { ...e.image!, verification: { ...e.image!.verification, identity: 'brand-only' } } })
    expect(displayNameOf(brandOnly)).toBe('Seiko (model not identified)')
  })

  it('the shipped catalogue has no playable watch without a verified photo', () => {
    const real = realCatalogue()
    for (const w of real.watches) {
      expect(w.status).toBe('verified')
      expect(w.image.source.license).toBeTruthy()
    }
  })
})

describe('collections', () => {
  const men = makeWatch('m1', {}, ['men'])
  const women = makeWatch('w1', {}, ['women'])
  const both = makeWatch('u1', {}, ['men', 'women'])
  const catalogue: Catalogue = {
    watches: [men, women, both],
    opening: { men: [['m1'], ['u1']], women: [['w1'], ['u1']] },
    entries: [],
    demo: false,
  }

  it('filters by audience, with unisex watches in both', () => {
    expect(poolFor(catalogue, 'men').map((w) => w.id)).toEqual(['m1', 'u1'])
    expect(poolFor(catalogue, 'women').map((w) => w.id)).toEqual(['w1', 'u1'])
    expect(poolFor(catalogue, 'all').map((w) => w.id)).toEqual(['m1', 'w1', 'u1'])
  })

  it('interleaves both openings for "all" without repeating unisex watches', () => {
    expect(openingFor(catalogue, 'all', poolFor(catalogue, 'all')).map((w) => w.id)).toEqual(['m1', 'w1', 'u1'])
  })

  it('builds an engine per collection', () => {
    const engine = engineFor(catalogue, 'women', 1)
    expect(engine.pool.map((w) => w.id)).toEqual(['w1', 'u1'])
    expect(engine.opening.map((w) => w.id)).toEqual(['w1', 'u1'])
  })
})

describe('demo catalogue', () => {
  it('draws every entry as a labelled sketch and never uses real names', () => {
    const demo = demoCatalogue()
    expect(demo.demo).toBe(true)
    expect(demo.watches.length).toBeGreaterThan(50)
    for (const w of demo.watches) {
      expect(w.imageUrl.startsWith('data:image/svg+xml')).toBe(true)
      expect(w.displayName).toMatch(/^demo design #\d+$/)
      expect(w.brand).toBe('Demo')
    }
  })

  it('offers full opening rounds for both collections', () => {
    const demo = demoCatalogue()
    expect(openingFor(demo, 'men', poolFor(demo, 'men'))).toHaveLength(20)
    expect(openingFor(demo, 'women', poolFor(demo, 'women'))).toHaveLength(20)
    expect(openingFor(demo, 'all', poolFor(demo, 'all')).length).toBeGreaterThanOrEqual(20)
  })
})
