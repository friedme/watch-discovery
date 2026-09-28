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
 * Sites that block automated visits altogether can list direct image URLs from
 * their own image server under "images"; those are tried first.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'
import sharp from 'sharp'
import { parseArgs, readCatalogue, sleep } from '../catalogue/lib'
import { extractFromHtml, largerVariant } from './extract'
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
  const images = pagesDoc.pages[id]?.images ?? []
  if (!entry || (!pages.length && !images.length)) {
    console.log(`${id}: no product page listed — skipped`)
    continue
  }
  const dir = join(PRIVATE_CANDIDATES_DIR, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const saved: PageCandidate[] = []
  const save = async (found: Found[], pageUrl: string, bodies = new Map<string, Buffer>()) => {
    for (const f of dedupe(found)) {
      // Ask the image server for a larger rendition first, if the URL names a small size.
      const larger = largerVariant(f.url)
      if (saved.length >= limit || saved.some((s) => s.imageUrl === f.url || s.imageUrl === larger)) continue
      const big = larger ? await download(larger, pageUrl) : null
      const imageUrl = big && larger ? larger : f.url
      const buf = big ?? bodies.get(f.url) ?? (await download(f.url, pageUrl))
      if (!buf) continue
      try {
        const meta = await sharp(buf).metadata()
        if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_SIDE) continue
        const n = saved.length + 1
        await sharp(buf).rotate().flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(join(dir, `${n}.jpg`))
        saved.push({ n, pageUrl, imageUrl, via: f.via, width: meta.width, height: meta.height })
      } catch {
        // Not a decodable image.
      }
    }
  }
  // Direct image URLs first: they are listed because the pages themselves can't be read.
  await save(
    images.map((url) => ({ url, via: 'direct' })),
    pages[0] ?? images[0],
  )
  for (const pageUrl of pages) {
    if (saved.length >= limit) break
    const before = saved.length
    await save(await fromHtml(pageUrl), pageUrl)
    // Pages that can't be read directly, or whose images can't be downloaded
    // without the page's cookies, are opened in a real browser.
    if (saved.length === before || flags.browser === true) {
      const { found, bodies } = await fromBrowser(pageUrl)
      await save(found, pageUrl, bodies)
    }
    await sleep(400)
  }
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify({ id, wanted: `${entry.brand} ${entry.model} — ${entry.variant ?? ''}`, reference: pagesDoc.pages[id]?.reference, candidates: saved }, null, 2))
  if (saved.length) {
    await contactSheet(
      dir,
      saved.map((c) => ({ n: c.n, file: join(dir, `${c.n}.jpg`), label: `${c.via} · ${new URL(c.imageUrl).hostname}` })),
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

/**
 * Opens the page in headless Chromium and returns the images it names (link
 * previews, JSON-LD) plus its largest images, with their bytes as the browser
 * received them (some image servers refuse requests without the page's cookies).
 */
async function fromBrowser(pageUrl: string): Promise<{ found: Found[]; bodies: Map<string, Buffer> }> {
  const bodies = new Map<string, Buffer>()
  try {
    if (!browser) {
      const { chromium } = await import('@playwright/test')
      browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
    }
    const context = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-US', viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const pending: Promise<void>[] = []
    page.on('response', (res) => {
      if (res.request().resourceType() !== 'image' || !res.ok()) return
      pending.push(
        res
          .body()
          .then((b) => void bodies.set(res.url(), b))
          .catch(() => {}),
      )
    })
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
      const found = dedupe([...extractFromHtml(html, page.url()), ...largest.map((url) => ({ url, via: 'largest-img' }))]).filter((f) =>
        // Not inline placeholders (lazy-loading sites use data: SVGs of the final size).
        /^https?:/.test(f.url),
      )
      await Promise.all(pending)
      // Named images the page didn't load itself: fetch them with the page's cookies.
      for (const f of found.slice(0, 16)) {
        if (bodies.has(f.url)) continue
        const res = await context.request.get(f.url, { headers: { Referer: pageUrl }, timeout: 20_000 }).catch(() => null)
        if (res?.ok()) bodies.set(f.url, await res.body())
      }
      return { found, bodies }
    } finally {
      await context.close()
    }
  } catch (err) {
    console.warn(`  browser failed for ${pageUrl}: ${(err as Error).message.split('\n')[0]}`)
    return { found: [], bodies }
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
