// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readCatalogue } from '../catalogue/lib'
import { extractFromHtml } from './extract'
import { readProductPages } from './lib'

describe('product image extraction', () => {
  it('reads og:image (decoding &amp;), JSON-LD product images and resolves relative URLs', () => {
    const html = `<html><head>
      <meta property="og:image" content="/media/watch.jpg?w=1600&amp;fmt=jpg">
      <meta name="twitter:image" content="https://cdn.example.com/t.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","image":["a.jpg",{"url":"https://cdn.example.com/b.jpg"}],"offers":{"image":"not-this.jpg"}}]}</script>
      <link rel="image_src" href="//cdn.example.com/c.jpg">
    </head></html>`
    expect(extractFromHtml(html, 'https://brand.example.com/watches/ref-1.html')).toEqual([
      { url: 'https://brand.example.com/media/watch.jpg?w=1600&fmt=jpg', via: 'og:image' },
      { url: 'https://cdn.example.com/t.jpg', via: 'twitter:image' },
      { url: 'https://brand.example.com/watches/a.jpg', via: 'json-ld' },
      { url: 'https://cdn.example.com/b.jpg', via: 'json-ld' },
      { url: 'https://brand.example.com/watches/not-this.jpg', via: 'json-ld' },
      { url: 'https://cdn.example.com/c.jpg', via: 'image_src' },
    ])
  })

  it('survives broken JSON-LD and pages without images', () => {
    expect(extractFromHtml('<script type="application/ld+json">{oops</script>', 'https://x.example')).toEqual([])
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
