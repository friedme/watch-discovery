import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'
import type { CatalogueEntry, ImageSource, ImageUsage } from '../../src/domain/types'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CATALOGUE_FILE = join(ROOT, 'catalogue/watches.json')
export const OPENING_FILE = join(ROOT, 'catalogue/opening-rounds.json')
export const MISSING_FILE = join(ROOT, 'catalogue/MISSING_ASSETS.md')
export const CANDIDATES_DIR = join(ROOT, 'catalogue/candidates')
export const PUBLIC_DIR = join(ROOT, 'public')

export interface CatalogueDoc {
  $comment?: string
  version: number
  watches: CatalogueEntry[]
}

export interface OpeningDoc {
  men: string[][]
  women: string[][]
}

export function readCatalogue(): CatalogueDoc {
  return JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')) as CatalogueDoc
}

export function writeCatalogue(doc: CatalogueDoc) {
  writeFileSync(CATALOGUE_FILE, JSON.stringify(doc, null, 2) + '\n')
}

export function readOpening(): OpeningDoc {
  return JSON.parse(readFileSync(OPENING_FILE, 'utf8')) as OpeningDoc
}

export function publicFileExists(file: string): boolean {
  return existsSync(join(PUBLIC_DIR, file))
}

/** Wikimedia asks automated clients for a descriptive User-Agent. */
export const USER_AGENT = 'WatchDiscoveryCatalogue/0.1 (personal non-commercial project; https://github.com/friedme/watch-discovery)'

const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined

export async function httpGet(url: string, accept = 'application/json'): Promise<Response> {
  const res = await undiciFetch(url, { dispatcher, headers: { 'User-Agent': USER_AGENT, Accept: accept } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return res as unknown as Response
}

export async function getJson<T>(url: string): Promise<T> {
  return (await (await httpGet(url)).json()) as T
}

export async function getBuffer(url: string): Promise<Buffer> {
  return Buffer.from(await (await httpGet(url, 'image/*')).arrayBuffer())
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function stripHtml(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classifies a licence string. Only licences that allow reuse (with
 * attribution at most) are accepted automatically; NC/ND, GFDL-only and
 * anything unclear are refused.
 */
export function classifyLicense(license: string): { usage: ImageUsage; name: string } | null {
  const l = license.trim()
  if (/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(l)) return null
  if (/^cc0|^cc-zero/i.test(l) || /public domain|^pd\b|^pdm|no restrictions/i.test(l)) return { usage: 'public-domain', name: l }
  if (/^cc[ -]by(-sa)?([ -]\d(\.\d)?)?/i.test(l)) return { usage: 'open-licence', name: l.replace(/^cc-by/i, 'CC BY') }
  return null
}

export function creditLine(author: string, license: string, provider: ImageSource['provider']): string {
  const where = provider === 'wikimedia-commons' ? ', via Wikimedia Commons' : provider === 'openverse' || provider === 'flickr' ? ', via Flickr' : ''
  return `${author || 'Unknown author'}, ${license}${where}`
}

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else positional.push(a)
  }
  return { positional, flags }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
