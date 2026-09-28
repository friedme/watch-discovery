# Watch Discovery — notes for Claude

Mobile-first React + TypeScript + Vite app (no backend, no accounts, no external AI calls). See README.md.

## Checks before every commit

`npm run check` (typecheck, oxlint, Vitest, catalogue validation) and `npm run test:e2e` (Playwright, phone viewport).

## Invariants — keep them true

- The engine (`src/engine/`) is pure: everything derives from `(catalogue, collection, seed, votes)`. Undo = drop the last vote. Never add hidden mutable state to selection or results.
- Pass has zero preference weight: it only marks a watch as seen.
- Results text: counts only. No percentages, match scores or personality labels. No prices or shop links. Names stay hidden while voting.
- Only `status: "verified"` catalogue entries with a documented, checked photo are ever shown. Never add placeholders to the real catalogue. Demo mode (`?demo=1`) is separate and labelled.
- Reference tastes (`private/reference-tastes/*.json`) are only used for the unlabelled second round and the comparison screen. They never label cards or steer the opening round or exploration. They are personal: never commit them while the repository is public.

## Private product photos (the usual route for home use; needs normal internet access)

1. `npm run photos:fetch` (or `-- --id a,b`) downloads candidates from the pages in `catalogue/product-pages.json` into the git-ignored `private/candidates/<id>/`. Add `--browser` when a page's link preview is only a lifestyle banner (Grand Seiko, JLC).
2. Look at `sheet.jpg` and the chosen `<n>.jpg`. Accept only a clear product shot of **that** reference, and prefer a front view on a plain background. Retailer pages often show other products (related items, modified watches, a different dial variant), so check the reference every time. Zoom into the dial before accepting: date window, numerals, bezel.
3. `npm run photos:accept -- <id> <n> [--set …]` saves `private/photos/<id>.jpg` and records it in `private/photos.json` (personal use only). Correct attributes to the photo (`--set`, `--features`, `--variant`). Use `--identity model-family` for dealer photos of vintage or pre-owned pieces.
4. Never commit anything under `private/`: the repository is public.
5. Brand sites behind Akamai or Cloudflare (Rolex, Casio, TAG Heuer, Zenith, IWC, Hermès, Chanel, Bulgari, Fossil, …) refuse this environment's IP. Don't try to get around that. Use their own image servers as `images` in `product-pages.json` (see the existing entries), or authorised retailers (WatchMaxx, Watches of Switzerland / Mayors / Betteridge, Tourneau, Jomashop).
6. Headless Chromium needs the proxy CA in its NSS store (`certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n proxy -i /root/.ccr/agent-proxy-ca.crt`, from `libnss3-tools`), otherwise every page fails with `ERR_CERT_AUTHORITY_INVALID`.

## Openly licensed photos (needs commons.wikimedia.org + upload.wikimedia.org)

1. `npm run catalogue:find -- --id <id>[,<id>…]` (add `--openverse` for Flickr CC; needs api.openverse.org + live.staticflickr.com).
2. Look at `catalogue/candidates/<id>/sheet.jpg`, then at the chosen `<n>.jpg` itself. Accept only if the photo clearly shows **that** model (check case shape, bezel, dial layout, hands, logo). Prefer a single watch, front view, whole watch visible, calm background. Refuse generic or ambiguous photos.
3. Correct the attributes to what is visible in **this** photo: `npm run catalogue:accept -- <id> <n> --identity model-family --set dialColour=…,band=…`. Use `exact-reference` only when the reference is verifiable; use `brand-only` when only the maker is certain.
4. `npm run catalogue:validate` regenerates `catalogue/MISSING_ASSETS.md` (committed photos only; private photos are only counted in the console output). Opening-round slots listed there come first. Commons rate-limits shared cloud IPs (HTTP 429), so expect slow runs.
5. Commit the photos (`public/watches/*.jpg`) together with `catalogue/watches.json`.
