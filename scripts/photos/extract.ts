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
  // Shops often preload the main product photo.
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel=["']preload["']/i.test(m[0]) && /\bas=["']image["']/i.test(m[0])) add(/href=["']([^"']+)["']/i.exec(m[0])?.[1], 'preload')
  }
  const imageSrc = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1]
  add(imageSrc, 'image_src')
  return out
}

/**
 * A larger rendition of an image from a resizing image server, when the URL
 * asks for a small size: Salesforce Commerce Cloud (sw/sh), Shopify and
 * imgix-style (width/height), Cloudinary (w_). Returns null otherwise.
 */
export function largerVariant(url: string, size = 1600): string | null {
  let out = url
  try {
    const u = new URL(url)
    for (const [key, other] of [
      ['sw', 'sh'],
      ['width', 'height'],
      ['wid', 'hei'],
    ]) {
      const w = Number(u.searchParams.get(key))
      if (w && w < size) {
        const h = Number(u.searchParams.get(other))
        u.searchParams.set(key, String(size))
        if (h) u.searchParams.set(other, String(Math.round((h / w) * size)))
      }
    }
    out = u.href
  } catch {
    return null
  }
  // Cloudinary: transformation segments follow /image/upload/, e.g. w_650,h_800,c_pad/q_auto/…
  const at = out.indexOf('/image/upload/')
  if (at >= 0) {
    const head = out.slice(0, at + '/image/upload/'.length)
    const segments = out.slice(head.length).split('/')
    for (let i = 0; i < segments.length && /^[a-z]{1,3}_/.test(segments[i]); i++) {
      const w = Number(/(?:^|,)w_(\d+)(?=,|$)/.exec(segments[i])?.[1])
      if (!w || w >= size) continue
      const k = size / w
      segments[i] = segments[i].replace(/(^|,)w_\d+(?=,|$)/, `$1w_${size}`).replace(/(^|,)h_(\d+)(?=,|$)/, (_, s: string, h: string) => `${s}h_${Math.round(Number(h) * k)}`)
    }
    out = head + segments.join('/')
  }
  return out === url ? null : out
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
