/**
 * npm run catalogue:find -- [--id a,b,c] [--limit 12] [--openverse]
 *
 * For each wanted watch (or the ids given), searches openly licensed photo
 * sources and downloads candidates for human/visual checking:
 *
 *   catalogue/candidates/<id>/<n>.jpg     candidate photos (max 1280 px)
 *   catalogue/candidates/<id>/candidates.json   source, author, licence
 *   catalogue/candidates/<id>/sheet.jpg   numbered contact sheet
 *
 * Nothing is added to the catalogue here. A candidate only becomes part of
 * the app through `npm run catalogue:accept` after someone has looked at it
 * and confirmed it shows the watch it is filed under.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { CatalogueEntry } from '../../src/domain/types'
import { CANDIDATES_DIR, classifyLicense, getBuffer, getJson, parseArgs, readCatalogue, sleep, stripHtml } from './lib'

export interface Candidate {
  n: number
  provider: 'wikimedia-commons' | 'openverse'
  title: string
  pageUrl: string
  fileUrl: string
  width: number
  height: number
  author: string
  license: string
  licenseUrl?: string
  attributionRequired: boolean
  description: string
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const OPENVERSE_API = 'https://api.openverse.org/v1/images/'
const MIN_SIDE = 600

const { flags } = parseArgs(process.argv.slice(2))
const limit = Number(flags.limit ?? 12)
const ids = typeof flags.id === 'string' ? flags.id.split(',').map((s) => s.trim()) : null
const useOpenverse = flags.openverse === true

const doc = readCatalogue()
const targets = doc.watches.filter((e) => (ids ? ids.includes(e.id) : e.status === 'wanted'))
if (!targets.length) {
  console.log(ids ? `No catalogue entries match ${ids.join(', ')}` : 'No wanted entries — nothing to search.')
  process.exit(0)
}

for (const entry of targets) {
  try {
    const found = await findForEntry(entry)
    console.log(`${entry.id}: ${found} candidate(s)`)
  } catch (err) {
    console.error(`${entry.id}: failed — ${(err as Error).message}`)
  }
}

async function findForEntry(entry: CatalogueEntry): Promise<number> {
  const commons = await commonsCandidates(entry)
  const open = useOpenverse ? await openverseCandidates(entry) : []
  const ranked = rank(entry, [...commons, ...open]).slice(0, limit)
  const dir = join(CANDIDATES_DIR, entry.id)
  mkdirSync(dir, { recursive: true })
  const saved: Candidate[] = []
  for (const c of ranked) {
    try {
      const buf = await getBuffer(c.fileUrl)
      const n = saved.length + 1
      await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(join(dir, `${n}.jpg`))
      saved.push({ ...c, n })
      await sleep(150)
    } catch (err) {
      console.warn(`  skip ${c.title}: ${(err as Error).message}`)
    }
  }
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify({ id: entry.id, wanted: `${entry.brand} ${entry.model} — ${entry.variant ?? ''}`, candidates: saved }, null, 2))
  if (saved.length) await contactSheet(dir, saved, `${entry.brand} ${entry.model} — ${entry.variant ?? ''}`)
  return saved.length
}

type Raw = Omit<Candidate, 'n'> & { fromCategory: boolean }

async function commonsCandidates(entry: CatalogueEntry): Promise<Raw[]> {
  const titles: Array<{ title: string; fromCategory: boolean }> = []
  const add = (title: string, fromCategory: boolean) => {
    if (!titles.some((t) => t.title === title)) titles.push({ title, fromCategory })
  }
  for (const cat of entry.search?.commonsCategories ?? []) {
    const url = `${COMMONS_API}?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=60&cmtitle=${encodeURIComponent(`Category:${cat}`)}`
    const res = await getJson<{ query?: { categorymembers?: Array<{ title: string }> } }>(url)
    for (const m of res.query?.categorymembers ?? []) add(m.title, true)
    await sleep(150)
  }
  for (const q of entry.search?.queries ?? [`${entry.brand} ${entry.model}`]) {
    const url = `${COMMONS_API}?action=query&format=json&list=search&srnamespace=6&srlimit=30&srsearch=${encodeURIComponent(`${q} filetype:bitmap`)}`
    const res = await getJson<{ query?: { search?: Array<{ title: string }> } }>(url)
    for (const m of res.query?.search ?? []) add(m.title, false)
    await sleep(150)
  }
  const out: Raw[] = []
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const url =
      `${COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280` +
      `&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|ImageDescription|AttributionRequired` +
      `&titles=${encodeURIComponent(batch.map((t) => t.title).join('|'))}`
    type Info = {
      title: string
      imageinfo?: Array<{
        url: string
        thumburl?: string
        descriptionurl: string
        width: number
        height: number
        mime: string
        extmetadata?: Record<string, { value: string }>
      }>
    }
    const res = await getJson<{ query?: { pages?: Record<string, Info> } }>(url)
    for (const page of Object.values(res.query?.pages ?? {})) {
      const info = page.imageinfo?.[0]
      if (!info || !/image\/(jpeg|png|webp)/.test(info.mime)) continue
      if (Math.min(info.width, info.height) < MIN_SIDE) continue
      const meta = info.extmetadata ?? {}
      const license = classifyLicense(meta.LicenseShortName?.value ?? '')
      if (!license) continue
      out.push({
        provider: 'wikimedia-commons',
        title: page.title,
        pageUrl: info.descriptionurl,
        fileUrl: info.thumburl ?? info.url,
        width: info.width,
        height: info.height,
        author: stripHtml(meta.Artist?.value) || 'Unknown author',
        license: license.name,
        licenseUrl: meta.LicenseUrl?.value,
        attributionRequired: meta.AttributionRequired?.value !== 'false',
        description: stripHtml(meta.ImageDescription?.value).slice(0, 400),
        fromCategory: batch.find((t) => t.title === page.title)?.fromCategory ?? false,
      })
    }
    await sleep(150)
  }
  return out
}

async function openverseCandidates(entry: CatalogueEntry): Promise<Raw[]> {
  const out: Raw[] = []
  for (const q of entry.search?.queries ?? [`${entry.brand} ${entry.model}`]) {
    const url = `${OPENVERSE_API}?q=${encodeURIComponent(q)}&license=by,by-sa,cc0,pdm&page_size=20&mature=false`
    type Item = {
      title?: string
      foreign_landing_url: string
      url: string
      creator?: string
      license: string
      license_version?: string
      license_url?: string
      width?: number
      height?: number
      provider?: string
    }
    const res = await getJson<{ results?: Item[] }>(url)
    for (const r of res.results ?? []) {
      if ((r.width ?? 0) && Math.min(r.width ?? 0, r.height ?? 0) < MIN_SIDE) continue
      const name = r.license === 'cc0' ? 'CC0 1.0' : r.license === 'pdm' ? 'Public Domain Mark 1.0' : `CC ${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim()
      const license = classifyLicense(name)
      if (!license) continue
      out.push({
        provider: 'openverse',
        title: r.title ?? '(untitled)',
        pageUrl: r.foreign_landing_url,
        fileUrl: r.url,
        width: r.width ?? 0,
        height: r.height ?? 0,
        author: r.creator || 'Unknown author',
        license: license.name,
        licenseUrl: r.license_url,
        attributionRequired: license.usage !== 'public-domain',
        description: `${r.title ?? ''} (${r.provider ?? 'openverse'})`,
        fromCategory: false,
      })
    }
    await sleep(300)
  }
  return out
}

/** Prefer photos whose title/description names the model, then category members, then resolution. */
function rank(entry: CatalogueEntry, list: Raw[]): Raw[] {
  const words = `${entry.model}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
  const score = (c: Raw) => {
    const text = `${c.title} ${c.description}`.toLowerCase()
    const hits = words.filter((w) => text.includes(w)).length
    return hits * 10 + (c.fromCategory ? 5 : 0) + Math.min(c.width, c.height) / 1000
  }
  return [...list].sort((a, b) => score(b) - score(a))
}

async function contactSheet(dir: string, list: Candidate[], caption: string) {
  const tile = 320
  const cols = 4
  const rows = Math.ceil(list.length / cols)
  const tiles = await Promise.all(
    list.map(async (c) => {
      const img = await sharp(join(dir, `${c.n}.jpg`)).resize(tile, tile, { fit: 'contain', background: '#ffffff' }).toBuffer()
      const label = Buffer.from(
        `<svg width="${tile}" height="${tile}"><rect x="0" y="0" width="54" height="40" fill="#000" opacity="0.75"/><text x="12" y="29" font-size="26" font-family="Arial" font-weight="700" fill="#fff">${c.n}</text></svg>`,
      )
      return sharp(img).composite([{ input: label }]).toBuffer()
    }),
  )
  const header = Buffer.from(
    `<svg width="${cols * tile}" height="48"><rect width="100%" height="100%" fill="#222"/><text x="14" y="32" font-size="22" font-family="Arial" fill="#fff">${caption.replace(/[<&>]/g, '')}</text></svg>`,
  )
  await sharp({ create: { width: cols * tile, height: rows * tile + 48, channels: 3, background: '#ffffff' } })
    .composite([
      { input: header, left: 0, top: 0 },
      ...tiles.map((input, i) => ({ input, left: (i % cols) * tile, top: 48 + Math.floor(i / cols) * tile })),
    ])
    .jpeg({ quality: 80 })
    .toFile(join(dir, 'sheet.jpg'))
}
