export type Found = { url: string; via: string }

/** og:image, twitter:image, JSON-LD Product images and <link rel="image_src">, in that order. */
export function extractFromHtml(html: string, baseUrl: string): Found[] {
  const out: Found[] = []
  const add = (url: string | undefined, via: string) => {
    if (!url) return
    try {
      out.push({ url: new URL(url.replace(/&amp;/g, '&'), baseUrl).href, via })
    } catch {
      // ignore malformed URLs
    }
  }
  const metaContent = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'gi')
    return [...html.matchAll(re)].map((m) => /content=["']([^"']+)["']/i.exec(m[0])?.[1])
  }
  for (const u of metaContent('og:image:secure_url')) add(u, 'og:image')
  for (const u of metaContent('og:image')) add(u, 'og:image')
  for (const u of metaContent('twitter:image')) add(u, 'twitter:image')
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectLdImages(JSON.parse(m[1].trim()), (u) => add(u, 'json-ld'))
    } catch {
      // invalid JSON-LD
    }
  }
  const imageSrc = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1]
  add(imageSrc, 'image_src')
  return out
}

function collectLdImages(node: unknown, add: (u: string) => void, inProduct = false): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((n) => collectLdImages(n, add, inProduct))
  const o = node as Record<string, unknown>
  const type = String(o['@type'] ?? '')
  const product = inProduct || /Product|IndividualProduct|ProductModel/i.test(type)
  if (product && o.image) {
    const imgs = Array.isArray(o.image) ? o.image : [o.image]
    for (const i of imgs) {
      if (typeof i === 'string') add(i)
      else if (i && typeof i === 'object' && typeof (i as Record<string, unknown>).url === 'string') add((i as Record<string, string>).url)
    }
  }
  for (const [k, v] of Object.entries(o)) if (k !== 'image') collectLdImages(v, add, product)
}
