/**
 * npm run catalogue:add-own -- --id <id> --file <path> --author "Name" --license "..." --source <url> [options]
 *
 * Adds a photo from your own computer — one you took yourself, or an image
 * you are allowed to use privately. Rights must be stated explicitly:
 *
 *   --usage personal-use-only   (default) fine for private, local use only;
 *                               the validator flags it before any public release
 *   --usage open-licence | public-domain   only when that is actually true
 *
 * Other options: --identity exact-reference|model-family|brand-only,
 * --checked-by "Name", --notes "...", --set key=value,... (see accept.ts)
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { validateAttributes } from '../../src/domain/taxonomy'
import type { WatchAttributes } from '../../src/domain/taxonomy'
import type { ImageUsage, ImageVerification } from '../../src/domain/types'
import { parseArgs, PUBLIC_DIR, readCatalogue, today, writeCatalogue } from './lib'

const { flags } = parseArgs(process.argv.slice(2))
const need = (name: string): string => {
  const v = flags[name]
  if (typeof v !== 'string' || !v.trim()) {
    console.error(`Missing --${name}. Usage: npm run catalogue:add-own -- --id <id> --file <path> --author "Name" --license "..." --source <url>`)
    process.exit(1)
  }
  return v.trim()
}

const id = need('id')
const path = need('file')
const author = need('author')
const license = need('license')
const source = need('source')
const usage = ((flags.usage as string) ?? 'personal-use-only') as ImageUsage
if (!['personal-use-only', 'open-licence', 'public-domain'].includes(usage)) throw new Error(`Bad --usage ${usage}`)
const identity = ((flags.identity as string) ?? 'model-family') as ImageVerification['identity']
if (!existsSync(path)) throw new Error(`File not found: ${path}`)

const doc = readCatalogue()
const entry = doc.watches.find((e) => e.id === id)
if (!entry) throw new Error(`No catalogue entry "${id}" — add it to catalogue/watches.json first`)

const attributes = { ...entry.attributes } as Record<string, unknown>
if (typeof flags.set === 'string') {
  for (const pair of flags.set.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim())
    attributes[k] = v
  }
}
const problems = validateAttributes(attributes)
if (problems.length) throw new Error(`Attribute problems: ${problems.join('; ')}`)

const file = `watches/${id}.jpg`
const out = await sharp(path)
  .rotate()
  .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(PUBLIC_DIR, file))

entry.attributes = attributes as WatchAttributes
entry.status = 'verified'
entry.image = {
  file,
  width: out.width,
  height: out.height,
  usage,
  source: {
    provider: /^https?:\/\//.test(source) ? 'other' : 'own-photo',
    pageUrl: source,
    author,
    license,
    attributionRequired: usage !== 'public-domain',
    credit: `${author}, ${license}`,
    retrievedAt: today(),
  },
  verification: {
    identity,
    checkedBy: typeof flags['checked-by'] === 'string' ? flags['checked-by'] : author,
    checkedAt: today(),
    ...(typeof flags.notes === 'string' ? { notes: flags.notes } : {}),
  },
}
writeCatalogue(doc)
console.log(`✓ ${id} → public/${file} (${out.width}×${out.height}, ${usage})`)
if (usage === 'personal-use-only') console.log('Note: marked personal-use-only — fine locally, must be replaced before any public release.')
