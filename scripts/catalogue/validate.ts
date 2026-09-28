/**
 * npm run catalogue:validate
 *
 * Validates catalogue/watches.json and catalogue/opening-rounds.json and
 * regenerates catalogue/MISSING_ASSETS.md. Exits non-zero on errors (not on
 * missing photos — those are expected until the catalogue is complete).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPrivatePhotos } from '../photos/lib'
import { MISSING_FILE, PUBLIC_DIR, readCatalogue, readOpening, ROOT } from './lib'
import { missingAssetsMarkdown, validateCatalogue } from './validation'

const MIN_PLAYABLE = 12

const doc = readCatalogue()
// Committed photos live in public/, private ones are referenced from the repo root.
const fileExists = (file: string) => existsSync(file.startsWith('private/') ? join(ROOT, file) : join(PUBLIC_DIR, file))
const report = validateCatalogue(doc, readOpening(), fileExists, readPrivatePhotos())
writeFileSync(MISSING_FILE, missingAssetsMarkdown(doc, report, MIN_PLAYABLE))

for (const w of report.warnings) console.warn(`warning: ${w}`)
for (const e of report.errors) console.error(`error:   ${e}`)
const withPhoto = [...report.verified, ...report.privatelyCovered]
const men = withPhoto.filter((e) => e.audiences.includes('men')).length
const women = withPhoto.filter((e) => e.audiences.includes('women')).length
console.log(
  `\n${doc.watches.length} catalogue entries · ${withPhoto.length} with a photo (${report.privatelyCovered.length} private; men ${men}, women ${women}) · ${report.wanted.length} waiting · ${report.emptyOpeningSlots.length} opening slots without a photo`,
)
console.log(`Missing-photo report written to catalogue/MISSING_ASSETS.md`)
if (report.errors.length) {
  console.error(`\n${report.errors.length} error(s).`)
  process.exit(1)
}
