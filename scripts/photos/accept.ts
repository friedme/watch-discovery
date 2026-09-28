/**
 * npm run photos:accept -- <id> <candidate-number> [options]
 *
 * Accepts a candidate from private/candidates/<id>/ after it has been looked
 * at and confirmed to show the watch it is filed under. The photo is framed
 * for the card and saved to private/photos/<id>.jpg, and recorded in
 * private/photos.json as personal-use-only with its source page.
 *
 * Corrections to the watch itself (attributes, name, variant) are facts about
 * that reference, so they go into catalogue/watches.json.
 *
 * Options
 *   --identity exact-reference|model-family|brand-only   (default exact-reference: product pages name the reference)
 *   --checked-by "Name"     who looked at it (default "Claude (visual check)")
 *   --notes "..."
 *   --set key=value,...     correct attributes to match THIS photo
 *   --features a,b | none   replace the visible-extras list
 *   --brand "..." --model "..." --variant "..."
 *   --fit cover --position "50% 40%"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateAttributes } from '../../src/domain/taxonomy'
import type { WatchAttributes } from '../../src/domain/taxonomy'
import type { ImageVerification } from '../../src/domain/types'
import { parseArgs, readCatalogue, ROOT, today, writeCatalogue } from '../catalogue/lib'
import { brandCredit, normalizePhoto, PRIVATE_CANDIDATES_DIR, readPrivatePhotos, writePrivatePhotos } from './lib'
import type { PageCandidate } from './lib'

const { positional, flags } = parseArgs(process.argv.slice(2))
const [id, nText] = positional
if (!id || !nText) {
  console.error('Usage: npm run photos:accept -- <id> <candidate-number> [--set key=value,...] [--identity model-family]')
  process.exit(1)
}

const doc = readCatalogue()
const entry = doc.watches.find((e) => e.id === id)
if (!entry) throw new Error(`No catalogue entry "${id}"`)
const dir = join(PRIVATE_CANDIDATES_DIR, id)
const { candidates } = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')) as { candidates: PageCandidate[] }
const c = candidates.find((x) => x.n === Number(nText))
if (!c) throw new Error(`Candidate ${nText} not found for ${id}`)

const identity = ((flags.identity as string) ?? 'exact-reference') as ImageVerification['identity']
if (!['exact-reference', 'model-family', 'brand-only'].includes(identity)) throw new Error(`Bad --identity ${identity}`)

const attributes = { ...entry.attributes } as Record<string, unknown>
if (typeof flags.set === 'string') {
  for (const pair of flags.set.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim())
    attributes[k] = v
  }
}
if (typeof flags.features === 'string') attributes.features = flags.features === 'none' ? [] : flags.features.split(',').map((s) => s.trim())
const problems = validateAttributes(attributes)
if (problems.length) throw new Error(`Attribute problems: ${problems.join('; ')}`)

if (typeof flags.brand === 'string') entry.brand = flags.brand
if (typeof flags.model === 'string') entry.model = flags.model
if (typeof flags.variant === 'string') entry.variant = flags.variant
entry.attributes = attributes as WatchAttributes
writeCatalogue(doc)

const file = `private/photos/${id}.jpg`
const out = await normalizePhoto(join(dir, `${c.n}.jpg`), join(ROOT, file))
const credit = brandCredit(entry.brand)
const photos = readPrivatePhotos()
photos[id] = {
  file,
  width: out.width,
  height: out.height,
  ...(flags.fit === 'cover' ? { fit: 'cover' as const } : {}),
  ...(typeof flags.position === 'string' ? { position: flags.position } : {}),
  usage: 'personal-use-only',
  source: {
    provider: 'other',
    pageUrl: c.pageUrl,
    fileUrl: c.imageUrl,
    author: credit.author,
    license: credit.license,
    attributionRequired: true,
    credit: credit.credit,
    retrievedAt: today(),
  },
  verification: {
    identity,
    checkedBy: typeof flags['checked-by'] === 'string' ? flags['checked-by'] : 'Claude (visual check)',
    checkedAt: today(),
    ...(typeof flags.notes === 'string' ? { notes: flags.notes } : {}),
  },
}
writePrivatePhotos(photos)
console.log(`✓ ${id}: candidate ${c.n} (${c.via}, ${new URL(c.pageUrl).hostname}) → ${file} ${out.width}×${out.height}${out.reframed ? ', re-framed' : ''}`)
