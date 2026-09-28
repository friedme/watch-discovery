/**
 * npm run catalogue:validate
 *
 * Validates catalogue/watches.json and catalogue/opening-rounds.json and
 * regenerates catalogue/MISSING_ASSETS.md. Exits non-zero on errors (not on
 * missing photos — those are expected until the catalogue is complete).
 */
import { writeFileSync } from 'node:fs'
import { MISSING_FILE, publicFileExists, readCatalogue, readOpening } from './lib'
import { missingAssetsMarkdown, validateCatalogue } from './validation'

const MIN_PLAYABLE = 12

const doc = readCatalogue()
const report = validateCatalogue(doc, readOpening(), publicFileExists)
writeFileSync(MISSING_FILE, missingAssetsMarkdown(doc, report, MIN_PLAYABLE))

for (const w of report.warnings) console.warn(`warning: ${w}`)
for (const e of report.errors) console.error(`error:   ${e}`)
const men = report.verified.filter((e) => e.audiences.includes('men')).length
const women = report.verified.filter((e) => e.audiences.includes('women')).length
console.log(
  `\n${doc.watches.length} catalogue entries · ${report.verified.length} with a verified photo (men ${men}, women ${women}) · ${report.wanted.length} waiting · ${report.emptyOpeningSlots.length} opening slots without a photo`,
)
console.log(`Missing-photo report written to catalogue/MISSING_ASSETS.md`)
if (report.errors.length) {
  console.error(`\n${report.errors.length} error(s).`)
  process.exit(1)
}
