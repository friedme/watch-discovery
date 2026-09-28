import catalogueData from '../../catalogue/watches.json'
import openingData from '../../catalogue/opening-rounds.json'
import { createEngine, interleaveOpenings, resolveOpening } from '../engine/context'
import type { Engine } from '../engine/context'
import { SimilarityIndex } from '../engine/similarity'
import { validateAttributes } from './taxonomy'
import type { Audience, CatalogueEntry, CollectionId, Watch } from './types'

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
  if (entry.image?.verification.identity === 'brand-only') return `${entry.brand} (model not identified)`
  return `${entry.brand} ${entry.model}`
}

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
    out.push({
      ...entry,
      status: 'verified',
      image: entry.image,
      imageUrl: resolveUrl(entry.image.file),
      displayName: displayNameOf(entry),
    })
  }
  return out
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

export function realCatalogue(): Catalogue {
  const entries = catalogueData.watches as CatalogueEntry[]
  const base = import.meta.env.BASE_URL
  return {
    watches: toPlayable(entries, (file) => `${base}${file}`),
    opening: openingData as OpeningRounds,
    entries,
    demo: false,
  }
}
