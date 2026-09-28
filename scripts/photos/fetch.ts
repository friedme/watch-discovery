/**
 * npm run photos:fetch -- [--id a,b] [--all] [--limit 8] [--browser] [--pages-file path]
 *
 * Downloads candidate photos for private, local use from the product pages
 * listed in catalogue/product-pages.json (official brand pages first, then
 * dealers). By default only watches without any photo yet are processed.
 *
 * Output (git-ignored):
 *   private/candidates/<id>/<n>.jpg        candidate photos
 *   private/candidates/<id>/candidates.json where each one came from
 *   private/candidates/<id>/sheet.jpg      numbered contact sheet
 *
 * Nothing is shown in the app until a candidate is checked and accepted with
 * `npm run photos:accept -- <id> <n>`.
 *
 * Each page is first read with a plain request (fast; most sites expose the
 * main product image in their og:image / JSON-LD for link previews). Pages
 * that block that, or show no usable image, are opened in headless Chromium.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'
import sharp from 'sharp'
import { parseArgs, readCatalogue, sleep } from '../catalogue/lib'
import { extractFromHtml } from './extract'
import type { Found } from './extract'
import { contactSheet, PRIVATE_CANDIDATES_DIR, readPrivatePhotos, readProductPages } from './lib'
import type { PageCandidate, ProductPages } from './lib'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}
const MIN_SIDE = 500

const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined

const { flags } = parseArgs(process.argv.slice(2))
const limit = Number(flags.limit ?? 8)
const pagesDoc: ProductPages =
  typeof flags['pages-file'] === 'string' ? (JSON.parse(readFileSync(flags['pages-file'], 'utf8')) as ProductPages) : readProductPages()
const catalogue = readCatalogue()
const accepted = readPrivatePhotos()
const ids =
  typeof flags.id === 'string'
    ? flags.id.split(',').map((s) => s.trim())
    : catalogue.watches
        .filter((e) => flags.all === true || (e.status !== 'verified' && !accepted[e.id]))
        .map((e) => e.id)
        .filter((id) => pagesDoc.pages[id])

let browser: import('@playwright/test').Browser | undefined

let ok = 0
for (const id of ids) {
  const entry = catalogue.watches.find((e) => e.id === id)
  const pages = pagesDoc.pages[id]?.pages ?? []
  if (!entry || !pages.length) {
    console.log(`${id}: no product page listed — skipped`)
    continue
  }
  const dir = join(PRIVATE_CANDIDATES_DIR, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const saved: PageCandidate[] = []
  for (const pageUrl of pages) {
    if (saved.length >= limit) break
    let found = await fromHtml(pageUrl)
    if (!found.length || flags.browser === true) found = [...found, ...(await fromBrowser(pageUrl))]
    for (const f of dedupe(found)) {
      if (saved.length >= limit) break
      const buf = await download(f.url, pageUrl)
      if (!buf) continue
      try {
        const meta = await sharp(buf).metadata()
        if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_SIDE) continue
        const n = saved.length + 1
        await sharp(buf).rotate().flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(join(dir, `${n}.jpg`))
        saved.push({ n, pageUrl, imageUrl: f.url, via: f.via, width: meta.width, height: meta.height })
      } catch {
        // Not a decodable image.
      }
    }
    await sleep(400)
  }
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify({ id, wanted: `${entry.brand} ${entry.model} — ${entry.variant ?? ''}`, reference: pagesDoc.pages[id]?.reference, candidates: saved }, null, 2))
  if (saved.length) {
    await contactSheet(
      dir,
      saved.map((c) => ({ n: c.n, file: join(dir, `${c.n}.jpg`), label: `${c.via} · ${new URL(c.pageUrl).hostname}` })),
      `${id}: ${entry.brand} ${entry.model} (${pagesDoc.pages[id]?.reference ?? ''})`,
    )
    ok++
  }
  console.log(`${id}: ${saved.length} candidate(s)`)
}
await browser?.close()
console.log(`\nDone: ${ok}/${ids.length} watches have candidates in private/candidates/. Check each sheet.jpg, then accept with npm run photos:accept -- <id> <n>`)

async function fromHtml(pageUrl: string): Promise<Found[]> {
  try {
    const res = await undiciFetch(pageUrl, { dispatcher, headers: HEADERS, redirect: 'follow' })
    if (!res.ok) return []
    return extractFromHtml(await res.text(), res.url || pageUrl)
  } catch {
    return []
  }
}

async function fromBrowser(pageUrl: string): Promise<Found[]> {
  try {
    if (!browser) {
      const { chromium } = await import('@playwright/test')
      browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
    }
    const context = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-US', viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await page.mouse.wheel(0, 800).catch(() => {})
      await page.waitForTimeout(1500)
      const html = await page.content()
      const largest = await page.evaluate(() =>
        Array.from(document.images)
          .filter((img) => img.naturalWidth >= 500 && img.naturalHeight >= 500)
          .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
          .slice(0, 6)
          .map((img) => img.currentSrc || img.src),
      )
      return [...extractFromHtml(html, page.url()), ...largest.map((url) => ({ url, via: 'largest-img' }))]
    } finally {
      await context.close()
    }
  } catch (err) {
    console.warn(`  browser failed for ${pageUrl}: ${(err as Error).message.split('\n')[0]}`)
    return []
  }
}

async function download(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await undiciFetch(url, { dispatcher, headers: { ...HEADERS, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: referer } })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function dedupe(list: Found[]): Found[] {
  const seen = new Set<string>()
  return list.filter((f) => {
    if (seen.has(f.url)) return false
    seen.add(f.url)
    return true
  })
}
