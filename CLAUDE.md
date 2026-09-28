# Watch Discovery — notes for Claude

Mobile-first React + TypeScript + Vite app (no backend, no accounts, no external AI calls). See README.md.

## Checks before every commit

`npm run check` (typecheck, oxlint, Vitest, catalogue validation) and `npm run test:e2e` (Playwright, phone viewport).

## Invariants — keep them true

- The engine (`src/engine/`) is pure: everything derives from `(catalogue, collection, seed, votes)`. Undo = drop the last vote. Never add hidden mutable state to selection or results.
- Pass has zero preference weight: it only marks a watch as seen.
- Results text: counts only. No percentages, match scores or personality labels. No prices or shop links. Names stay hidden while voting.
- Only `status: "verified"` catalogue entries with a documented, checked photo are ever shown. Never add placeholders to the real catalogue. Demo mode (`?demo=1`) is separate and labelled.

## Curating photos (needs network access to commons.wikimedia.org + upload.wikimedia.org)

1. `npm run catalogue:find -- --id <id>[,<id>…]` (add `--openverse` for Flickr CC; needs api.openverse.org + live.staticflickr.com).
2. Look at `catalogue/candidates/<id>/sheet.jpg`, then at the chosen `<n>.jpg` itself. Accept only if the photo clearly shows **that** model (check case shape, bezel, dial layout, hands, logo). Prefer a single watch, front view, whole watch visible, calm background. Refuse generic or ambiguous photos.
3. Correct the attributes to what is visible in **this** photo: `npm run catalogue:accept -- <id> <n> --identity model-family --set dialColour=…,band=…`. Use `exact-reference` only when the reference is verifiable; use `brand-only` when only the maker is certain.
4. `npm run catalogue:validate` regenerates `catalogue/MISSING_ASSETS.md`. Opening-round slots listed there come first.
5. Commit the photos (`public/watches/*.jpg`) together with `catalogue/watches.json`.
