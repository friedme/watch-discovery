# Watch Discovery

Find out which watch designs someone likes — one real photo at a time.

You see a single watch photo and answer **Yay** (I like how it looks), **Nay** (I don't) or **Pass** (no opinion).
A curated opening round of 20 watches covers the whole range of designs. After that, exploration adapts to your answers.
At the end you get:

- **Favourites**: the watches you actually said Yay to, with names revealed.
- **Taste directions**: groups of liked watches that look alike. Several directions can coexist.
- **What stood out**: cautious observations that always state the counts behind them ("You said Yay to 5 of the 6 watches with a blue face"). They also say when two traits always appeared together.
- **New designs worth exploring**: unseen watches that resemble what you liked, each naming the liked watches it resembles, plus wildcards.

It is visual discovery only: there are no prices, no shop links and no brand names while voting. It makes no claims about wrist fit. Reactions are to photographs.

Built for three uses: a partner judging men's watches ("what would you like on me?"), someone discovering their own taste in women's watches, and anyone rating watches for themselves. Several people can use the same phone, and **Compare** shows where two people agree.

## Status

| Part | State |
| --- | --- |
| App (voting, undo, adaptive exploration, results, compare, sharing) | Done and tested |
| Catalogue of 104 watch designs with visual attributes and curated opening rounds | Done |
| Photo pipeline (find, check, accept, validate) | Done |
| Product-page list for every watch + photo scraper for private use | Done |
| **Photos** | **None yet.** The build environment could not reach any photo source, see [`catalogue/MISSING_ASSETS.md`](catalogue/MISSING_ASSETS.md) |

Until photos are added, the app says so on the start screen and offers **demo mode**. Demo mode uses vector sketches drawn from the same design data, is clearly labelled and is stored separately. Real results never contain placeholders.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.12 or newer (the LTS installer is fine).

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). Add `?demo=1` to try the flow with sketches: http://localhost:5173/?demo=1

### Use it on a phone (same Wi‑Fi)

```bash
npm run dev:phone
```

This prints a **Network** address such as `http://192.168.1.23:5173`. Open that on the phone while both devices are on the same Wi‑Fi. Your computer's firewall may ask to allow the connection.

A production build also works (`npm run build`, then `npm run preview`). The `dist/` folder is static files and needs no server-side code.

### Where data lives

Everything stays in the browser that was used, in `localStorage`, so progress survives closing the tab. There are no accounts, nothing is uploaded, and no AI service is called. **Copy link for another device** puts the results inside the link itself (after the `#`, which browsers never send to a server). Opening that link on another phone running the app adds the results there, for example so you can compare.

## How it works

- **Blind voting.** Names stay hidden until the results, so reactions are to the design.
- **Pass is neutral.** A pass never counts as a like or a dislike. It only marks the watch as seen.
- **Undo is exact.** A session is stored as a list of votes, and every card and result is recalculated from that list. Undo removes the last vote, so everything is exactly as it was before it. Tests check this after every vote of a long random session.
- **Adaptive exploration** repeats the same six-card pattern: three "more like a direction you liked" cards (taking turns between directions, so one taste can't crowd out another), one contrast (a near-lookalike of a liked watch that differs in one detail), one unexplored design and one wildcard. Card choice is deterministic for a session, which is part of what makes Undo exact.
- **Observations** appear only after 8 Yay/Nay answers, need at least 3 matching reactions, and are phrased as counts. They never use percentages or personality labels.

The design vocabulary (style, case shape and colour, face colour, strap, look, detail, markers, rim, feel, sparkle, visible extras) is in [`src/domain/taxonomy.ts`](src/domain/taxonomy.ts).

## Adding photos

Two routes, both of which check every photo before it's shown:

**1. Product photos for private use (recommended for home use).** `catalogue/product-pages.json` lists the official product page for every watch (or a reputable dealer page for vintage and discontinued pieces). The scraper downloads the main product photo from each page into the git-ignored `private/` folder:

```bash
npm run photos:fetch                        # all watches without a photo (or --id a,b)
# look at private/candidates/<id>/sheet.jpg, then:
npm run photos:accept -- rolex-submariner 1 # frames the photo for the card, records its source
npm run catalogue:validate
```

Private photos are marked *personal use only*. They stay on the computer that downloaded them, because this GitHub repository is public. The scraper needs normal internet access, so run it on your own computer, or in a cloud environment with **Network access: Full**.

**2. Openly licensed photos** (Wikimedia Commons, optionally Flickr via Openverse). These can be committed and published:

```bash
npm run catalogue:find -- --id cartier-tank     # candidates + contact sheet
npm run catalogue:accept -- cartier-tank 3      # after checking it
```

Your own photo (e.g. of a watch you own): `npm run catalogue:add-own -- --id <id> --file photo.jpg --author "Me" --license "Own photo" --source "own photo"`.

A collection appears in the app once it has 12 photos. The opening round automatically uses whichever watches in each slot have photos.

## Development

```bash
npm test               # unit + component tests (Vitest)
npm run test:e2e       # browser tests on a phone viewport (Playwright; run `npx playwright install chromium` once)
npm run check          # typecheck + lint + tests + catalogue validation
```

```
src/domain/     design vocabulary, catalogue loading, types
src/engine/     pure logic: stats, similarity, taste groups, card selection, observations, suggestions, session/undo
src/storage/    localStorage persistence, share links
src/ui/         screens and components
src/demo/       sketch renderer for demo mode
catalogue/      watches.json (source of truth), opening-rounds.json, reports
scripts/catalogue/  photo pipeline
tests/e2e/      Playwright tests
```

Nothing is deployed. Publishing the app publicly is a separate decision, and it needs photos that are all `open-licence` or `public-domain`: the validator flags any `personal-use-only` photo, and private photos are never committed.
