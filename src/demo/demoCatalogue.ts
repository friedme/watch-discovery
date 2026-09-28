import catalogueData from '../../catalogue/watches.json'
import openingData from '../../catalogue/opening-rounds.json'
import type { Catalogue, OpeningRounds } from '../domain/catalogue'
import { validateAttributes } from '../domain/taxonomy'
import type { CatalogueEntry, Watch } from '../domain/types'
import { sketchDataUri } from './sketch'

/**
 * Demo mode: every catalogue entry (wanted or verified) drawn as a labelled
 * vector sketch of its design attributes. For trying the flow and for tests —
 * sketches never carry real watch names and demo results are marked as such.
 */
export function demoCatalogue(): Catalogue {
  const entries = catalogueData.watches as CatalogueEntry[]
  const watches: Watch[] = entries
    .filter((e) => e.status !== 'rejected' && validateAttributes(e.attributes).length === 0)
    .map((e, i) => ({
      ...e,
      status: 'verified' as const,
      brand: 'Demo',
      model: `design #${i + 1}`,
      displayName: `demo design #${i + 1}`,
      imageUrl: sketchDataUri(e.attributes),
      image: {
        file: '',
        width: 400,
        height: 500,
        usage: 'personal-use-only' as const,
        source: {
          provider: 'other' as const,
          pageUrl: 'about:blank',
          author: 'Watch Discovery demo generator',
          license: 'Generated sketch (not a photograph)',
          attributionRequired: false,
          credit: 'Demo sketch — not a real watch photo',
          retrievedAt: '',
        },
        verification: { identity: 'brand-only' as const, checkedBy: 'n/a (demo)', checkedAt: '' },
      },
    }))
  return { watches, opening: openingData as OpeningRounds, entries, demo: true }
}
