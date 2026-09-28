import { validateAttributes } from '../../src/domain/taxonomy'
import type { CatalogueEntry, WatchImage } from '../../src/domain/types'
import type { CatalogueDoc, OpeningDoc } from './lib'

export interface ValidationReport {
  errors: string[]
  warnings: string[]
  verified: CatalogueEntry[]
  /** Entries whose only photo is a private (personal-use, git-ignored) one. */
  privatelyCovered: CatalogueEntry[]
  wanted: CatalogueEntry[]
  /** Opening slots (by audience) for which no alternative has a verified photo. */
  emptyOpeningSlots: Array<{ audience: 'men' | 'women'; index: number; ids: string[] }>
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Checks the catalogue for structural problems and for anything that would
 * let an undocumented or unchecked photo reach the app.
 */
export function validateCatalogue(
  doc: CatalogueDoc,
  opening: OpeningDoc,
  fileExists: (file: string) => boolean,
  privatePhotos: Record<string, WatchImage> = {},
): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set<string>()

  for (const e of doc.watches) {
    const where = `[${e.id ?? '?'}]`
    if (!e.id || !ID.test(e.id)) errors.push(`${where} id must be lowercase words joined by dashes`)
    if (ids.has(e.id)) errors.push(`${where} duplicate id`)
    ids.add(e.id)
    if (!e.brand?.trim() || !e.model?.trim()) errors.push(`${where} brand and model are required`)
    if (!Array.isArray(e.audiences) || !e.audiences.length || e.audiences.some((a) => a !== 'men' && a !== 'women'))
      errors.push(`${where} audiences must be a non-empty list of "men" / "women"`)
    for (const p of validateAttributes(e.attributes)) errors.push(`${where} ${p}`)
    if (!['wanted', 'verified', 'rejected'].includes(e.status)) errors.push(`${where} unknown status "${e.status}"`)

    if (e.status === 'verified') {
      const img = e.image
      if (!img) {
        errors.push(`${where} verified but has no image`)
        continue
      }
      if (!img.file || !fileExists(img.file)) errors.push(`${where} image file missing: public/${img.file}`)
      if (!(img.width > 0 && img.height > 0)) errors.push(`${where} image width/height missing`)
      const s = img.source
      if (!s?.pageUrl || !/^https?:\/\//.test(s.pageUrl)) errors.push(`${where} image source page URL missing`)
      if (!s?.author?.trim()) errors.push(`${where} image author missing`)
      if (!s?.license?.trim()) errors.push(`${where} image licence missing`)
      if (!s?.credit?.trim()) errors.push(`${where} image credit line missing`)
      if (!['open-licence', 'public-domain', 'personal-use-only'].includes(img.usage)) errors.push(`${where} image usage must be documented`)
      if (img.usage === 'personal-use-only') warnings.push(`${where} photo is personal-use-only — replace before any public release`)
      const v = img.verification
      if (!v?.checkedBy?.trim() || !v.checkedAt) errors.push(`${where} photo has not been checked (verification.checkedBy / checkedAt)`)
      if (v && !['exact-reference', 'model-family', 'brand-only'].includes(v.identity)) errors.push(`${where} verification.identity invalid`)
    } else if (e.image) {
      warnings.push(`${where} has an image but status is "${e.status}" — it will not be shown`)
    }
  }

  const byId = new Map(doc.watches.map((e) => [e.id, e]))
  for (const [id, photo] of Object.entries(privatePhotos)) {
    const where = `[private ${id}]`
    if (!byId.has(id)) errors.push(`${where} no catalogue entry with this id`)
    if (!photo.file || !fileExists(photo.file)) errors.push(`${where} photo file missing: ${photo.file}`)
    if (!photo.source?.pageUrl || !photo.source.author || !photo.source.license) errors.push(`${where} source, author and licence must be recorded`)
    if (!photo.verification?.checkedBy || !photo.verification.checkedAt) errors.push(`${where} photo has not been checked`)
  }
  const hasPhoto = (id: string) => byId.get(id)?.status === 'verified' || Boolean(privatePhotos[id])
  const emptyOpeningSlots: ValidationReport['emptyOpeningSlots'] = []
  for (const audience of ['men', 'women'] as const) {
    const slots = opening[audience]
    if (!Array.isArray(slots)) {
      errors.push(`opening-rounds.json: "${audience}" must be a list of slots`)
      continue
    }
    slots.forEach((slot, index) => {
      for (const id of slot) {
        const e = byId.get(id)
        if (!e) errors.push(`opening-rounds.json: ${audience} slot ${index + 1} names unknown watch "${id}"`)
        else if (!e.audiences.includes(audience)) errors.push(`opening-rounds.json: "${id}" is not in the ${audience} collection`)
      }
      if (!slot.some(hasPhoto)) emptyOpeningSlots.push({ audience, index, ids: slot })
    })
  }

  return {
    errors,
    warnings,
    verified: doc.watches.filter((e) => e.status === 'verified'),
    privatelyCovered: doc.watches.filter((e) => e.status !== 'verified' && privatePhotos[e.id]),
    wanted: doc.watches.filter((e) => e.status === 'wanted' && !privatePhotos[e.id]),
    emptyOpeningSlots,
  }
}

export function missingAssetsMarkdown(doc: CatalogueDoc, report: ValidationReport, minPlayable: number): string {
  const count = (a: 'men' | 'women') => report.verified.filter((e) => e.audiences.includes(a)).length
  const countPrivate = (a: 'men' | 'women') => report.privatelyCovered.filter((e) => e.audiences.includes(a)).length
  const lines: string[] = []
  lines.push('# Missing photos')
  lines.push('')
  lines.push('_Generated by `npm run catalogue:validate` — do not edit by hand._')
  lines.push('')
  lines.push('Watches listed here have no verified photograph yet. They are **never shown** in the app — not as placeholders,')
  lines.push('not in suggestions, not in results. See `catalogue/README.md` for how to add a photo.')
  lines.push('')
  lines.push('| Collection | Open-licence photos | Private photos (this computer only) | Needed to offer the collection |')
  lines.push('| --- | ---: | ---: | ---: |')
  lines.push(`| Men's watches | ${count('men')} | ${countPrivate('men')} | ${minPlayable} |`)
  lines.push(`| Women's watches | ${count('women')} | ${countPrivate('women')} | ${minPlayable} |`)
  lines.push(`| All entries | ${report.verified.length} of ${doc.watches.length} | ${report.privatelyCovered.length} | |`)
  lines.push('')
  if (report.emptyOpeningSlots.length) {
    lines.push('## Opening-round slots without a photo (highest priority)')
    lines.push('')
    lines.push('Any one watch per slot is enough.')
    lines.push('')
    for (const s of report.emptyOpeningSlots) lines.push(`- **${s.audience === 'men' ? "Men's" : "Women's"} slot ${s.index + 1}:** ${s.ids.map((id) => `\`${id}\``).join(' or ')}`)
    lines.push('')
  }
  lines.push('## All watches waiting for a photo')
  lines.push('')
  lines.push('| id | Watch | Variant wanted | Collections | Search hints |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const e of report.wanted) {
    const hints = [...(e.search?.commonsCategories ?? []).map((c) => `Category:${c}`), ...(e.search?.queries ?? [])].join('; ')
    lines.push(`| \`${e.id}\` | ${e.brand} ${e.model} | ${e.variant ?? ''} | ${e.audiences.join(', ')} | ${hints} |`)
  }
  lines.push('')
  return lines.join('\n')
}
