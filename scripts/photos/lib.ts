import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import type { ImageSource, ImageVerification } from '../../src/domain/types'
import { ROOT } from '../catalogue/lib'

/**
 * Private photos: product photos used for personal, local use only. They live
 * in the git-ignored private/ folder (the GitHub repository is public), are
 * always marked "personal-use-only" and are picked up by the app at build time.
 */
export const PRIVATE_DIR = join(ROOT, 'private')
export const PRIVATE_PHOTOS_DIR = join(PRIVATE_DIR, 'photos')
export const PRIVATE_PHOTOS_FILE = join(PRIVATE_DIR, 'photos.json')
export const PRIVATE_CANDIDATES_DIR = join(PRIVATE_DIR, 'candidates')
export const PRODUCT_PAGES_FILE = join(ROOT, 'catalogue/product-pages.json')

export interface ProductPages {
  pages: Record<
    string,
    {
      reference?: string
      pages: string[]
      /** Direct image URLs from the brand's own image server, for sites whose pages block automated visits. Credited to the first page. */
      images?: string[]
      facts?: string
    }
  >
}

/** One accepted private photo (same shape as WatchImage, file relative to the repo root). */
export interface PrivatePhoto {
  file: string
  width: number
  height: number
  fit?: 'contain' | 'cover'
  position?: string
  usage: 'personal-use-only'
  source: ImageSource
  verification: ImageVerification
}

export type PrivatePhotos = Record<string, PrivatePhoto>

export interface PageCandidate {
  n: number
  pageUrl: string
  imageUrl: string
  via: string
  width: number
  height: number
}

export function readProductPages(): ProductPages {
  return JSON.parse(readFileSync(PRODUCT_PAGES_FILE, 'utf8')) as ProductPages
}

export function readPrivatePhotos(): PrivatePhotos {
  if (!existsSync(PRIVATE_PHOTOS_FILE)) return {}
  return JSON.parse(readFileSync(PRIVATE_PHOTOS_FILE, 'utf8')) as PrivatePhotos
}

export function writePrivatePhotos(photos: PrivatePhotos) {
  mkdirSync(dirname(PRIVATE_PHOTOS_FILE), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(photos).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(PRIVATE_PHOTOS_FILE, JSON.stringify(sorted, null, 2) + '\n')
}

/** Brand name as used in credits, taken from the catalogue entry. */
export function brandCredit(brand: string): { author: string; license: string; credit: string } {
  return {
    author: `${brand} (product photo)`,
    license: `© ${brand}. Used privately, not redistributed`,
    credit: `Product photo © ${brand}`,
  }
}

/**
 * Studio shots on a light background (plain or a soft gradient) are re-framed
 * to the card's 4:5 shape around the watch, so every watch appears at a
 * similar size: the watch fills ~88% of the limiting dimension, the original
 * backdrop is kept where the photo reaches, and missing margins are filled
 * with the colour of the nearest corners. Anything else (lifestyle photos,
 * dark backgrounds) is only resized.
 */
export async function normalizePhoto(input: Buffer | string, outFile: string): Promise<{ width: number; height: number; reframed: boolean }> {
  mkdirSync(dirname(outFile), { recursive: true })
  const { data: full, info: size } = await sharp(input).rotate().flatten({ background: '#ffffff' }).toBuffer({ resolveWithObject: true })
  const frame = await studioFrame(full, size.width, size.height)
  let pipeline = sharp(full)
  if (frame) {
    const { box, top, bottom } = frame
    const W = size.width
    const H = size.height
    const targetH = Math.round(Math.max(box.height / 0.88, (box.width / 0.88) * 1.25))
    const targetW = Math.round(targetH * 0.8)
    const x0 = Math.round(box.left + box.width / 2 - targetW / 2)
    const y0 = Math.round(box.top + box.height / 2 - targetH / 2)
    const ix0 = Math.max(0, x0)
    const iy0 = Math.max(0, y0)
    const ix1 = Math.min(W, x0 + targetW)
    const iy1 = Math.min(H, y0 + targetH)
    let buf = await sharp(full).extract({ left: ix0, top: iy0, width: ix1 - ix0, height: iy1 - iy0 }).toBuffer()
    const pad = { top: iy0 - y0, bottom: y0 + targetH - iy1, left: ix0 - x0, right: x0 + targetW - ix1 }
    // One side at a time, each with the backdrop colour on that side.
    if (pad.top > 0) buf = await sharp(buf).extend({ top: pad.top, background: top }).toBuffer()
    if (pad.bottom > 0) buf = await sharp(buf).extend({ bottom: pad.bottom, background: bottom }).toBuffer()
    if (pad.left > 0 || pad.right > 0) buf = await sharp(buf).extend({ left: Math.max(0, pad.left), right: Math.max(0, pad.right), background: mix(top, bottom) }).toBuffer()
    pipeline = sharp(buf)
  }
  const out = await pipeline
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(outFile)
  return { width: out.width, height: out.height, reframed: Boolean(frame) }
}

type Rgb = { r: number; g: number; b: number }

/**
 * For a studio shot (light, near-uniform corners), the watch's bounding box
 * and the backdrop colours at the top and bottom. Null for anything else.
 */
export async function studioFrame(
  image: Buffer,
  width: number,
  height: number,
): Promise<{ box: { left: number; top: number; width: number; height: number }; top: Rgb; bottom: Rgb } | null> {
  const { data, info } = await sharp(image).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x: number, y: number): Rgb => {
    const i = (y * info.width + x) * info.channels
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const corners = [px(1, 1), px(62, 1), px(1, 62), px(62, 62)]
  const bright = corners.every((c) => Math.min(c.r, c.g, c.b) >= 215)
  const spread = Math.max(...(['r', 'g', 'b'] as const).map((k) => Math.max(...corners.map((c) => c[k])) - Math.min(...corners.map((c) => c[k]))))
  if (!bright || spread > 30) return null
  const top = mix(corners[0], corners[1])
  const bottom = mix(corners[2], corners[3])
  const lightest = [...corners].sort((a, b) => b.r + b.g + b.b - (a.r + a.g + a.b))[0]
  const trimmed = await sharp(image)
    .trim({ background: lightest, threshold: Math.max(18, spread + 10) })
    .toBuffer({ resolveWithObject: true })
  const t = trimmed.info as typeof trimmed.info & { trimOffsetLeft?: number; trimOffsetTop?: number }
  const box = { left: -(t.trimOffsetLeft ?? 0), top: -(t.trimOffsetTop ?? 0), width: t.width, height: t.height }
  // Nothing found, or the "watch" is the whole photo: leave it alone.
  if (box.width < width * 0.1 || box.height < height * 0.1) return null
  return { box, top, bottom }
}

function mix(a: Rgb, b: Rgb): Rgb {
  return { r: Math.round((a.r + b.r) / 2), g: Math.round((a.g + b.g) / 2), b: Math.round((a.b + b.b) / 2) }
}

export async function contactSheet(dir: string, files: Array<{ n: number; file: string; label?: string }>, caption: string) {
  const tile = 320
  const cols = 4
  const rows = Math.max(1, Math.ceil(files.length / cols))
  const esc = (s: string) => s.replace(/[<&>"]/g, '')
  const tiles = await Promise.all(
    files.map(async (f) => {
      const img = await sharp(f.file).resize(tile, tile, { fit: 'contain', background: '#ffffff' }).toBuffer()
      const label = Buffer.from(
        `<svg width="${tile}" height="${tile}"><rect x="0" y="0" width="54" height="40" fill="#000" opacity="0.75"/><text x="12" y="29" font-size="26" font-family="Arial" font-weight="700" fill="#fff">${f.n}</text>${
          f.label ? `<rect x="0" y="${tile - 24}" width="${tile}" height="24" fill="#000" opacity="0.6"/><text x="6" y="${tile - 7}" font-size="14" font-family="Arial" fill="#fff">${esc(f.label).slice(0, 44)}</text>` : ''
        }</svg>`,
      )
      return sharp(img).composite([{ input: label }]).toBuffer()
    }),
  )
  const header = Buffer.from(
    `<svg width="${cols * tile}" height="48"><rect width="100%" height="100%" fill="#222"/><text x="14" y="32" font-size="22" font-family="Arial" fill="#fff">${esc(caption)}</text></svg>`,
  )
  await sharp({ create: { width: cols * tile, height: rows * tile + 48, channels: 3, background: '#ffffff' } })
    .composite([{ input: header, left: 0, top: 0 }, ...tiles.map((input, i) => ({ input, left: (i % cols) * tile, top: 48 + Math.floor(i / cols) * tile }))])
    .jpeg({ quality: 80 })
    .toFile(join(dir, 'sheet.jpg'))
}
