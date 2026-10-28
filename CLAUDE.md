# Trainer Desk — instructions for Claude Code

Unofficial Pokémon GO + TCG + Pokédex info site, Pokémon Emerald (GBA) look.
**Single static file: `index.html`** (HTML+CSS+JS inline) for the app. No framework, no backend, no Vercel build step. Owner-approved (Oct 2026): generated static pages committed to the repo — per-tab copies (`npm run pages`) and per-Pokémon and per-set pages (`npm run static-pages`) — produced by the scripts in `scripts/`, checked by `npm test`.

## Commands
- `npm install && npx playwright install chromium` (once)
- `npm run dev` → http://localhost:3000
- `npm test` → Playwright suites incl. mobile layout checks (network is mocked/aborted; no live calls)
- `npm run test:mobile` → just the mobile checks
- `npm run pages` → after ANY edit to `index.html`, regenerate `go.html`, `tcg.html`, `pokedex.html`, `arena.html` (copies with per-tab title/description/social card; `npm test` fails if they're stale). Never edit those four files by hand. Social card images: `python3 scripts/make-og-images.py`.
- `npm run static-pages` → regenerate the static pages — 1,025 Pokémon pages (`pokedex/<slug>.html`), 176 TCG set pages (`tcg/<slug>.html`), the set index (`tcg/sets.html`) and `sitemap.xml` — from `data/pokedex.json` + `data/tcg.json` (`scripts/build-pages.mjs`, styles in `assets/dex-page.css`). Rerun after changing the builder, the CSS, `ROUTES` or `SHOW_SPRITES`. Never edit generated files by hand; `npm test` fails if they're stale. `npm run data` re-downloads both open datasets first (a GitHub Action does this weekly and commits the result).
- `npm run events` → refresh `data/events.json` (facts-only snapshot of the ScrapedDuck event feed, `scripts/fetch-events.mjs`; keeps events that ended in the last 30 days) and rebuild the static pages. Event guide pages `go/<eventID>.html` + the schedule `go/events.html` are built by `scripts/build-pages.mjs` from that snapshot and the `EVENT_NOTES` in `index.html` (an event's own note → page until 30 days after it ends; a shared series note → only within 60 days of the start, to avoid near-identical pages). `.github/workflows/event-pages.yml` does this daily. After editing `EVENT_NOTES`, run `npm run static-pages` (or `npm run events`) so the pages match; `npm test` fails if they're stale.
- `scripts/fetch-tcgdex.mjs` (weekly in `refresh-data.yml`, after `fetch-tcg-data.mjs`): writes `data/tcg-id-map.json` (pokemontcg.io → TCGdex IDs) and adds sets newer than the pokemon-tcg-data snapshot from TCGdex (`src:"tcgdex"`, cached in `data/tcgdex-sets.json`). Wrong or missing set matches go in its `SET_FIXES`. pokemontcg.io shuts down March 1, 2027: plan and status in `docs/tcg-migration.md`.
- `prices/` is written daily by `.github/workflows/prices.yml` (`scripts/snapshot-prices.mjs`, card price history for the sparklines). Don't edit it by hand; don't add it to `.vercelignore` (the site reads it).
- Deploy = push to `main` (Vercel project `trainer-desk-4n8w`, www.trainerdesk.net; see HANDOFF.md)

## Mobile-first (required on every change)
Most visitors are on phones. `tests/mobile.test.js` (part of `npm test`, and run by GitHub Actions on every push) checks every tab at 320/375/414px. Any change must keep it passing:
- No horizontal page scroll; nothing past the screen edge (use a deliberate `overflow-x:auto` scroller for wide content).
- Tap targets (buttons, links outside running text, selects, inputs) at least 44×44px.
- Text at least 12px (10px for the Press Start 2P pixel font); form fields at least 16px so iOS doesn't zoom on focus.
- Keep `width=device-width` in the viewport meta and never disable pinch-zoom.
- Design new UI at 375px first, then widen with `min-width` media queries.
- Dark mode (`<html data-theme="dark">`, set before paint from `td-theme` or the device setting; ☀️/🌙 toggle in the header): new UI must be readable in both themes. Use the CSS variables (`--ink`, `--ink-soft`, `--card`, `--mint`, `--gold-ink`) or add a `:root[data-theme="dark"]` rule. `tests/dark-mode.test.js` scans every tab and dialog for text contrast (4.5:1 in dark, nothing invisible in light); add new views/dialogs to its `scanAll()`. Static pages follow the device via `prefers-color-scheme` in `assets/dex-page.css`.

## Architecture rules
- All fetches go through `fetchWithTimeout()` (6s abort by default; TCG calls use `TCG_TIMEOUT` 12s / `TCGDEX_TIMEOUT` 15s). Every live section MUST have an offline fallback; no section may render blank.
- Data: ScrapedDuck (GO events), pokemontcg.io `API` const (cards/sets; automatic failover to TCGdex `TCGDEX`), Limitless TCG (tournaments), PokéAPI (`POKEAPI`, Pokédex, lazy-loaded on first tab open).
- `UPCOMING_SETS` is hand-maintained; write blurbs in our own words.
- `EVENT_NOTES` / `EVENT_NOTE_PATTERNS` (GO event notes) are hand-maintained the same way: facts from the official announcement in our own words, a `checked` date, nothing copied from LeekDuck or Niantic, and no automated fetching of Niantic/Scopely sites (their terms forbid bots).
- Escape dynamic text with `esc()` in new code.
- `sw.js` (installable app/offline) handles same-origin GETs only, network first; never let it cache cross-origin responses (card images and sprites must stay hotlinked, not stored). Bump its `VERSION` if saved copies must be dropped.
- Do not remove `const API=...` (it was once dropped by a bad edit; `tests/tcg.test.js` guards it). After any edit run `npm test`.

## Legal guardrails (do not relax without asking the owner)
- Facts only; no copied descriptions. One owner-approved exception (Oct 2026): the Today tab's Pokémon of the day shows the game's own Pokédex entry, fetched live from PokéAPI at view time (`SHOW_FLAVOR_TEXT`), credited, never stored in the repo. Do not extend flavor text to other places without asking the owner.
- Card images are hotlinked from pokemontcg.io and its image CDN (`images.pokemontcg.io`, `images.scrydex.com`), or TCGdex's `assets.tcgdex.net` (owner-approved Oct 2026 as the main source going forward: backup mode now, sets added from TCGdex on the static pages, and the whole app after the switch in docs/tcg-migration.md), never rehosted. The TCG dataset includes flavor and attack text: never store or show it. Sprites are hotlinked from PokéAPI's sprite repo (`SHOW_SPRITES=true`, owner's decision) in both the Pokédex and the Pixel Arena minigame, which respects the same flag; never copy sprite files into the repo. The Arena stays free: no ads, no purchases, no prizes. `assets/arena` (generated backgrounds, CC0 effect images) may live in the repo; Pokémon sprites and card art may not.
- Keep the "unofficial fan project" footer and attributions.
- No ads, merch, paywalls, or "Pokémon" in domain/business names.
