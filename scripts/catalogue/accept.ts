/**
 * npm run catalogue:accept -- <id> <candidate-number> [options]
 *
 * Accepts one downloaded candidate (see catalogue:find) after it has been
 * looked at and confirmed to show the watch it is filed under. Copies the
 * photo to public/watches/<id>.jpg and records source, author, licence and
 * who checked it.
 *
 * Options
 *   --identity exact-reference|model-family|brand-only   what the photo is confirmed to show (default model-family)
 *   --checked-by "Name"      who looked at it (default "Claude (visual check)")
 *   --notes "..."            anything worth recording about the check
 *   --set key=value,...      correct attributes to match THIS photo, e.g. --set dialColour=blue,band=leather
 *   --features a,b           replace the visible extras list (use "none" for an empty list)
 *   --variant "..."          describe the variant shown
 *   --fit cover --position "50% 40%"   crop to fill the card instead of showing the whole photo
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { validateAttributes } from '../../src/domain/taxonomy'
import type { WatchAttributes } from '../../src/domain/taxonomy'
import type { ImageVerification } from '../../src/domain/types'
import type { Candidate } from './find-candidates'
import { CANDIDATES_DIR, classifyLicense, creditLine, parseArgs, PUBLIC_DIR, readCatalogue, today, writeCatalogue } from './lib'

const { positional, flags } = parseArgs(process.argv.slice(2))
const [id, nText] = positional
if (!id || !nText) {
  console.error('Usage: npm run catalogue:accept -- <id> <candidate-number> [--identity model-family] [--set key=value,...]')
  process.exit(1)
}

const doc = readCatalogue()
const entry = doc.watches.find((e) => e.id === id)
if (!entry) throw new Error(`No catalogue entry "${id}"`)

const dir = join(CANDIDATES_DIR, id)
const { candidates } = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')) as { candidates: Candidate[] }
const c = candidates.find((x) => x.n === Number(nText))
if (!c) throw new Error(`Candidate ${nText} not found for ${id}`)
const license = classifyLicense(c.license)
if (!license) throw new Error(`Licence "${c.license}" is not acceptable`)

const identity = (flags.identity as ImageVerification['identity']) ?? 'model-family'
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

const file = `watches/${id}.jpg`
const out = await sharp(join(dir, `${c.n}.jpg`))
  .rotate()
  .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(PUBLIC_DIR, file))

entry.attributes = attributes as WatchAttributes
if (typeof flags.variant === 'string') entry.variant = flags.variant
entry.status = 'verified'
entry.image = {
  file,
  width: out.width,
  height: out.height,
  ...(flags.fit === 'cover' ? { fit: 'cover' as const } : {}),
  ...(typeof flags.position === 'string' ? { position: flags.position } : {}),
  usage: license.usage,
  source: {
    provider: c.provider,
    pageUrl: c.pageUrl,
    fileUrl: c.fileUrl,
    title: c.title,
    author: c.author,
    license: c.license,
    ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
    attributionRequired: c.attributionRequired,
    credit: creditLine(c.author, c.license, c.provider),
    retrievedAt: today(),
  },
  verification: {
    identity,
    checkedBy: typeof flags['checked-by'] === 'string' ? flags['checked-by'] : 'Claude (visual check)',
    checkedAt: today(),
    ...(typeof flags.notes === 'string' ? { notes: flags.notes } : {}),
  },
}
writeCatalogue(doc)
console.log(`✓ ${id} now uses candidate ${c.n}: "${c.title}" (${c.license}, ${c.author}) → public/${file} ${out.width}×${out.height}`)
console.log('Run `npm run catalogue:validate` to refresh the missing-photo report.')
