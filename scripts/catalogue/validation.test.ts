// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CatalogueEntry } from '../../src/domain/types'
import { makeWatch } from '../../src/test/fixtures'
import { classifyLicense, publicFileExists, readCatalogue, readOpening } from './lib'
import type { CatalogueDoc } from './lib'
import { missingAssetsMarkdown, validateCatalogue } from './validation'

function entry(id: string, overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const { imageUrl: _u, displayName: _d, ...w } = makeWatch(id)
  return { ...w, ...overrides } as CatalogueEntry
}

describe('the real catalogue', () => {
  it('has no validation errors', () => {
    const report = validateCatalogue(readCatalogue(), readOpening(), publicFileExists)
    expect(report.errors).toEqual([])
  })

  it('only marks entries verified when the photo file exists', () => {
    const doc = readCatalogue()
    for (const e of doc.watches.filter((w) => w.status === 'verified')) expect(publicFileExists(e.image!.file)).toBe(true)
  })
})

describe('validation rules', () => {
  const opening = { men: [['a']], women: [['a']] }
  const exists = () => true

  it('accepts a fully documented, checked photo', () => {
    const doc: CatalogueDoc = { version: 1, watches: [entry('a')] }
    expect(validateCatalogue(doc, opening, exists).errors).toEqual([])
  })

  it('rejects a verified entry whose photo file is missing', () => {
    const doc: CatalogueDoc = { version: 1, watches: [entry('a')] }
    expect(validateCatalogue(doc, opening, () => false).errors.join()).toMatch(/image file missing/)
  })

  it('rejects undocumented rights or an unchecked photo', () => {
    const base = entry('a')
    const img = base.image!
    const doc: CatalogueDoc = {
      version: 1,
      watches: [{ ...base, image: { ...img, source: { ...img.source, license: '', author: '' }, verification: { ...img.verification, checkedBy: '' } } }],
    }
    const errors = validateCatalogue(doc, opening, exists).errors.join('\n')
    expect(errors).toMatch(/licence missing/)
    expect(errors).toMatch(/author missing/)
    expect(errors).toMatch(/not been checked/)
  })

  it('warns about personal-use-only photos', () => {
    const base = entry('a')
    const doc: CatalogueDoc = { version: 1, watches: [{ ...base, image: { ...base.image!, usage: 'personal-use-only' } }] }
    const report = validateCatalogue(doc, opening, exists)
    expect(report.errors).toEqual([])
    expect(report.warnings.join()).toMatch(/personal-use-only/)
  })

  it('rejects unknown attribute values and unknown opening ids', () => {
    const bad = entry('a', { attributes: { ...entry('a').attributes, dialColour: 'plaid' as never } })
    const report = validateCatalogue({ version: 1, watches: [bad] }, { men: [['nope']], women: [] }, exists)
    expect(report.errors.join('\n')).toMatch(/dialColour: unknown value "plaid"/)
    expect(report.errors.join('\n')).toMatch(/unknown watch "nope"/)
  })

  it('lists wanted entries and empty opening slots in the missing-photo report', () => {
    const wanted = entry('b', { status: 'wanted', image: undefined, search: { queries: ['Test b'] } })
    const doc: CatalogueDoc = { version: 1, watches: [entry('a'), wanted] }
    const report = validateCatalogue(doc, { men: [['a'], ['b']], women: [] }, exists)
    expect(report.emptyOpeningSlots).toEqual([{ audience: 'men', index: 1, ids: ['b'] }])
    const md = missingAssetsMarkdown(doc, report, 12)
    expect(md).toContain('`b`')
    expect(md).toContain("Men's slot 2")
  })
})

describe('licence classification', () => {
  it.each([
    ['CC BY-SA 4.0', 'open-licence'],
    ['CC BY 2.0', 'open-licence'],
    ['CC BY-SA 3.0', 'open-licence'],
    ['CC0', 'public-domain'],
    ['Public domain', 'public-domain'],
    ['Public Domain Mark 1.0', 'public-domain'],
  ])('accepts %s', (license, usage) => {
    expect(classifyLicense(license)?.usage).toBe(usage)
  })

  it.each(['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 2.0', 'GFDL', 'All rights reserved', 'Fair use', ''])('refuses %s', (license) => {
    expect(classifyLicense(license)).toBeNull()
  })
})
