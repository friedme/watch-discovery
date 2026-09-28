import type { WatchAttributes } from './taxonomy'

export type Audience = 'men' | 'women'
export type CollectionId = Audience | 'all'
export type Choice = 'yay' | 'nay' | 'pass'

/** How the right to use a photo is documented. */
export type ImageUsage =
  /** Openly licensed (CC0 / CC BY / CC BY-SA …) — may be republished with attribution. */
  | 'open-licence'
  | 'public-domain'
  /** Fine for private, local use only — must be replaced before any public release. */
  | 'personal-use-only'

export interface ImageSource {
  provider: 'wikimedia-commons' | 'openverse' | 'flickr' | 'own-photo' | 'other'
  /** Human-readable page describing the photo and its licence. */
  pageUrl: string
  /** Original file URL, when different from the page. */
  fileUrl?: string
  title?: string
  author: string
  license: string
  licenseUrl?: string
  attributionRequired: boolean
  /** Ready-to-display credit line. */
  credit: string
  retrievedAt: string
}

export interface ImageVerification {
  /** What the photo is confirmed to show. Display names never claim more than this. */
  identity: 'exact-reference' | 'model-family' | 'brand-only'
  checkedBy: string
  checkedAt: string
  notes?: string
}

export interface WatchImage {
  /** Path relative to /public, e.g. "watches/rolex-submariner-black.jpg" */
  file: string
  width: number
  height: number
  /** "contain" (default) shows the whole photo; "cover" fills the card. */
  fit?: 'contain' | 'cover'
  /** CSS object-position for fit "cover". */
  position?: string
  usage: ImageUsage
  source: ImageSource
  verification: ImageVerification
}

/** A catalogue record. Only `verified` records with an image are ever shown. */
export interface CatalogueEntry {
  id: string
  brand: string
  model: string
  /** Visible variant, e.g. "blue face, steel bracelet". */
  variant?: string
  audiences: Audience[]
  attributes: WatchAttributes
  status: 'wanted' | 'verified' | 'rejected'
  image?: WatchImage
  /** Hints for the photo-finding pipeline. */
  search?: { commonsCategories?: string[]; queries?: string[] }
  notes?: string
}

/** A watch that can be shown: verified, with a documented photo. */
export interface Watch extends CatalogueEntry {
  status: 'verified'
  image: WatchImage
  /** Resolved URL (or data: URI in demo mode). */
  imageUrl: string
  /** Name that never claims more than the verification supports. */
  displayName: string
}

export interface Vote {
  watchId: string
  choice: Choice
  at: number
}

export interface SessionData {
  id: string
  name: string
  collection: CollectionId
  seed: number
  createdAt: number
  updatedAt: number
  votes: Vote[]
  /** Vote counts at which the person chose "keep exploring" at a checkpoint. */
  continuedAt: number[]
  /** Reference taste whose watches get an unlabelled second round. */
  reference?: string
  demo?: boolean
  importedAt?: number
}
