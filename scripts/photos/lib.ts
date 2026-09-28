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
  pages: Record<string, { reference?: string; pages: string[]; facts?: string }>
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
 * Studio shots on a plain light background are trimmed and re-framed to the
 * card's 4:5 shape with even margins, so every watch appears at a similar
 * size. Anything else (lifestyle photos, dark backgrounds) is only resized.
 */
export async function normalizePhoto(input: Buffer | string, outFile: string): Promise<{ width: number; height: number; reframed: boolean }> {
  mkdirSync(dirname(outFile), { recursive: true })
  const base = sharp(input).rotate()
  const { data, info } = await base.clone().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels
    return [data[i], data[i + 1], data[i + 2]]
  }
  const corners = [px(1, 1), px(62, 1), px(1, 62), px(62, 62)]
  const bright = corners.every((c) => Math.min(...c) >= 225)
  const even = corners.every((c) => c.every((v, k) => Math.abs(v - corners[0][k]) <= 12))
  let pipeline = sharp(input).rotate().flatten({ background: '#ffffff' })
  let reframed = false
  if (bright && even) {
    const [r, g, b] = corners[0]
    const trimmed = await pipeline.trim({ background: { r, g, b }, threshold: 18 }).toBuffer({ resolveWithObject: true })
    const w = trimmed.info.width
    const h = trimmed.info.height
    // Target 4:5 with the watch filling ~88% of the limiting dimension.
    const targetH = Math.max(h / 0.88, (w / 0.88) * 1.25)
    const targetW = targetH * 0.8
    const padX = Math.max(0, Math.round((targetW - w) / 2))
    const padY = Math.max(0, Math.round((targetH - h) / 2))
    pipeline = sharp(trimmed.data).extend({ top: padY, bottom: padY, left: padX, right: padX, background: { r, g, b } })
    reframed = true
  }
  const out = await pipeline
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(outFile)
  return { width: out.width, height: out.height, reframed }
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
