import catalogueData from '../../catalogue/watches.json'
import openingData from '../../catalogue/opening-rounds.json'
import { createEngine, interleaveOpenings, resolveOpening } from '../engine/context'
import type { Engine } from '../engine/context'
import { SimilarityIndex } from '../engine/similarity'
import { validateAttributes } from './taxonomy'
import type { Audience, CatalogueEntry, CollectionId, Watch, WatchImage } from './types'

export interface OpeningRounds {
  /** Each slot lists preferred watch ids in order of preference. */
  men: string[][]
  women: string[][]
}

/** A collection needs at least this many verified photos to be offered. */
export const MIN_PLAYABLE = 12
/** Cards per side when the "both" collection interleaves the two openings. */
export const MIXED_OPENING_PER_SIDE = 12

export const COLLECTIONS: Array<{ id: CollectionId; label: string; hint: string }> = [
  { id: 'men', label: "Men's watches", hint: 'Also good for finding what you would like on a partner' },
  { id: 'women', label: "Women's watches", hint: 'Discover your own taste' },
  { id: 'all', label: 'Both', hint: 'Everything, mixed together' },
]

export function collectionLabel(id: CollectionId): string {
  return COLLECTIONS.find((c) => c.id === id)?.label ?? id
}

/** Display name that never claims more than the photo check supports. */
export function displayNameOf(entry: CatalogueEntry): string {
  if (entry.brand === UNKNOWN_MAKER) return `${entry.model} (maker unknown)`
  if (entry.image?.verification.identity === 'brand-only') return `${entry.brand} (model not identified)`
  return `${entry.brand} ${entry.model}`
}

/** Brand value for photos of real watches whose maker cannot be established (e.g. unsigned vintage pieces). */
export const UNKNOWN_MAKER = 'Unknown maker'

/**
 * Only verified entries with a documented photo become playable watches.
 * Wanted entries (no photo yet) are never shown, suggested or counted —
 * there are no placeholders in the real catalogue.
 */
export function toPlayable(entries: CatalogueEntry[], resolveUrl: (file: string) => string): Watch[] {
  const out: Watch[] = []
  for (const entry of entries) {
    if (entry.status !== 'verified' || !entry.image) continue
    if (validateAttributes(entry.attributes).length) continue
    const { source, verification } = entry.image
    if (!source?.license || !source.author || !source.pageUrl || !verification?.checkedBy) continue
    const imageUrl = resolveUrl(entry.image.file)
    if (!imageUrl) continue
    out.push({
      ...entry,
      status: 'verified',
      image: entry.image,
      imageUrl,
      displayName: displayNameOf(entry),
    })
  }
  return out
}

/**
 * Photos kept only on this computer (git-ignored private/ folder): product
 * photos for personal use. A private photo turns a wanted entry into a
 * playable one; it never leaves the machine through git.
 */
export function withPrivatePhotos(entries: CatalogueEntry[], photos: Record<string, WatchImage>): CatalogueEntry[] {
  return entries.map((e) => {
    const photo = photos[e.id]
    if (!photo || e.status === 'rejected') return e
    return { ...e, status: 'verified', image: { ...photo, usage: 'personal-use-only' } }
  })
}

export interface Catalogue {
  watches: Watch[]
  opening: OpeningRounds
  /** All entries including wanted ones (for credits / missing-asset views). */
  entries: CatalogueEntry[]
  demo: boolean
}

export function poolFor(catalogue: Catalogue, collection: CollectionId): Watch[] {
  if (collection === 'all') return catalogue.watches
  return catalogue.watches.filter((w) => w.audiences.includes(collection as Audience))
}

export function openingFor(catalogue: Catalogue, collection: CollectionId, pool: Watch[]): Watch[] {
  if (collection === 'all') {
    return interleaveOpenings(
      resolveOpening(catalogue.opening.men, pool),
      resolveOpening(catalogue.opening.women, pool),
      MIXED_OPENING_PER_SIDE,
    )
  }
  return resolveOpening(catalogue.opening[collection], pool)
}

const simCache = new WeakMap<Catalogue, Map<CollectionId, SimilarityIndex>>()

export function engineFor(catalogue: Catalogue, collection: CollectionId, seed: number): Engine {
  const pool = poolFor(catalogue, collection)
  let byCollection = simCache.get(catalogue)
  if (!byCollection) simCache.set(catalogue, (byCollection = new Map()))
  let sim = byCollection.get(collection)
  if (!sim) byCollection.set(collection, (sim = new SimilarityIndex(pool)))
  return createEngine(pool, openingFor(catalogue, collection, pool), seed, sim)
}

// Optional, git-ignored private data (empty objects when the folder is absent).
const privatePhotoFiles = import.meta.glob('/private/photos.json', { eager: true, import: 'default' }) as Record<string, Record<string, WatchImage>>
const privateImageUrls = import.meta.glob('/private/photos/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function realCatalogue(): Catalogue {
  const privatePhotos = Object.values(privatePhotoFiles)[0] ?? {}
  const entries = withPrivatePhotos(catalogueData.watches as CatalogueEntry[], privatePhotos)
  const base = import.meta.env.BASE_URL
  const resolveUrl = (file: string) => (file.startsWith('private/') ? (privateImageUrls[`/${file}`] ?? '') : `${base}${file}`)
  return {
    watches: toPlayable(entries, resolveUrl),
    opening: openingData as OpeningRounds,
    entries,
    demo: false,
  }
}
