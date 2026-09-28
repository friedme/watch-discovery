// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { readCatalogue } from '../catalogue/lib'
import { extractFromHtml, largerVariant } from './extract'
import { normalizePhoto, readProductPages } from './lib'

describe('product image extraction', () => {
  it('reads og:image (decoding &amp;), JSON-LD product images and resolves relative URLs', () => {
    const html = `<html><head>
      <meta property="og:image" content="/media/watch.jpg?w=1600&amp;fmt=jpg">
      <meta name="twitter:image" content="https://cdn.example.com/t.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","image":["a.jpg",{"url":"https://cdn.example.com/b.jpg"}],"offers":{"image":"not-this.jpg"}}]}</script>
      <link rel="image_src" href="//cdn.example.com/c.jpg">
      <link rel="preload" href='https://cdn.example.com/p.jpg?width=800&amp;height=800' as="image"/>
      <link rel="preload" href="/font.woff2" as="font">
    </head></html>`
    expect(extractFromHtml(html, 'https://brand.example.com/watches/ref-1.html')).toEqual([
      { url: 'https://brand.example.com/media/watch.jpg?w=1600&fmt=jpg', via: 'og:image' },
      { url: 'https://cdn.example.com/t.jpg', via: 'twitter:image' },
      { url: 'https://brand.example.com/watches/a.jpg', via: 'json-ld' },
      { url: 'https://cdn.example.com/b.jpg', via: 'json-ld' },
      { url: 'https://brand.example.com/watches/not-this.jpg', via: 'json-ld' },
      { url: 'https://cdn.example.com/p.jpg?width=800&height=800', via: 'preload' },
      { url: 'https://cdn.example.com/c.jpg', via: 'image_src' },
    ])
  })

  it('survives broken JSON-LD and pages without images', () => {
    expect(extractFromHtml('<script type="application/ld+json">{oops</script>', 'https://x.example')).toEqual([])
  })

  it('asks resizing image servers for a larger rendition', () => {
    expect(largerVariant('https://shop.example/dw/image/v2/x/a.png?sw=750&sh=750&sm=fit')).toBe('https://shop.example/dw/image/v2/x/a.png?sw=1600&sh=1600&sm=fit')
    expect(largerVariant('https://cdn.example/files/w.jpg?v=1&width=600')).toBe('https://cdn.example/files/w.jpg?v=1&width=1600')
    expect(largerVariant('https://res.example/image/upload/c_limit,w_800/v1/w.png')).toBe('https://res.example/image/upload/c_limit,w_1600/v1/w.png')
    expect(largerVariant('https://res.example/image/upload/w_650,h_800,c_pad/q_auto/f_auto/w/1.jpg')).toBe('https://res.example/image/upload/w_1600,h_1969,c_pad/q_auto/f_auto/w/1.jpg')
    expect(largerVariant('https://asset.example/image/upload/c_limit,f_auto,w_780/Assets/w_1.jpg')).toBe('https://asset.example/image/upload/c_limit,f_auto,w_1600/Assets/w_1.jpg')
    expect(largerVariant('https://res.example/image/upload/q_auto/f_auto/c_limit,w_1600/v1/w.png')).toBeNull()
    expect(largerVariant('https://cdn.example/w.jpg?width=2400')).toBeNull()
    expect(largerVariant('https://cdn.example/w.jpg')).toBeNull()
  })
})

describe('product page list', () => {
  it('covers every catalogue entry with at least one http(s) page', () => {
    const pages = readProductPages().pages
    for (const e of readCatalogue().watches) {
      expect(pages[e.id]?.pages.length, e.id).toBeGreaterThan(0)
      for (const url of pages[e.id].pages) expect(url, e.id).toMatch(/^https:\/\//)
    }
  })
})

describe('photo framing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'frame-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  /** A dark 200×300 "watch" at (x, y) on a light backdrop that fades from `top` to `bottom` grey. */
  async function studioShot(w: number, h: number, x: number, y: number, top: number, bottom: number) {
    const backdrop = Buffer.from(
      `<svg width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${top},${top},${top})"/><stop offset="1" stop-color="rgb(${bottom},${bottom},${bottom})"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="${x}" y="${y}" width="200" height="300" fill="#202020"/></svg>`,
    )
    return sharp(backdrop).png().toBuffer()
  }

  async function watchBox(file: string) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let minY = info.height
    let maxY = 0
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 3] < 100) [minY, maxY] = [Math.min(minY, y), Math.max(maxY, y)]
    return { height: maxY - minY + 1, width: info.width, total: info.height }
  }

  it('crops a studio shot with a soft gradient to 4:5 around the watch', async () => {
    const out = join(dir, 'gradient.jpg')
    const r = await normalizePhoto(await studioShot(900, 900, 150, 400, 250, 232), out)
    expect(r.reframed).toBe(true)
    expect(r.width / r.height).toBeCloseTo(0.8, 2)
    const box = await watchBox(out)
    expect(box.height / box.total).toBeCloseTo(0.88, 1)
  })

  it('pads when the watch reaches the edge of the photo', async () => {
    const out = join(dir, 'edge.jpg')
    const r = await normalizePhoto(await studioShot(400, 300, 100, 0, 255, 255), out)
    expect(r.reframed).toBe(true)
    expect(r.width / r.height).toBeCloseTo(0.8, 2)
  })

  it('leaves photos with a dark or busy background alone', async () => {
    const dark = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#303a50' } }).png().toBuffer()
    const r = await normalizePhoto(dark, join(dir, 'dark.jpg'))
    expect(r).toEqual({ width: 600, height: 400, reframed: false })
  })
})
