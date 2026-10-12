# Trainer Desk — instructions for Claude Code

Unofficial Pokémon GO + TCG + Pokédex info site, Pokémon Emerald (GBA) look.
**Single static file: `index.html`** (HTML+CSS+JS inline) for the app. No framework, no backend, no Vercel build step. Owner-approved (Oct 2026): generated static pages committed to the repo — per-tab copies (`npm run pages`) and per-Pokémon pages (`npm run dex-pages`) — produced by the scripts in `scripts/`, checked by `npm test`.

## Commands
- `npm install && npx playwright install chromium` (once)
- `npm run dev` → http://localhost:3000
- `npm test` → Playwright suites incl. mobile layout checks (network is mocked/aborted; no live calls)
- `npm run test:mobile` → just the mobile checks
- `npm run pages` → after ANY edit to `index.html`, regenerate `go.html`, `tcg.html`, `pokedex.html`, `arena.html` (copies with per-tab title/description/social card; `npm test` fails if they're stale). Never edit those four files by hand. Social card images: `python3 scripts/make-og-images.py`.
- `npm run dex-pages` → regenerate the 1,025 static Pokémon pages (`pokedex/<slug>.html`) and `sitemap.xml` from `data/pokedex.json` after changing `scripts/build-pokedex-pages.mjs`, `assets/dex-page.css`, `ROUTES` or `SHOW_SPRITES`. Never edit `pokedex/*.html` or `sitemap.xml` by hand; `npm test` fails if they're stale. `npm run data` re-downloads PokéAPI's open CSV data first (a GitHub Action does this weekly and commits the result).
- Deploy = push to `main` (Vercel project `trainer-desk-4n8w`, www.trainerdesk.net; see HANDOFF.md)

## Mobile-first (required on every change)
Most visitors are on phones. `tests/mobile.test.js` (part of `npm test`, and run by GitHub Actions on every push) checks every tab at 320/375/414px. Any change must keep it passing:
- No horizontal page scroll; nothing past the screen edge (use a deliberate `overflow-x:auto` scroller for wide content).
- Tap targets (buttons, links outside running text, selects, inputs) at least 44×44px.
- Text at least 12px (10px for the Press Start 2P pixel font); form fields at least 16px so iOS doesn't zoom on focus.
- Keep `width=device-width` in the viewport meta and never disable pinch-zoom.
- Design new UI at 375px first, then widen with `min-width` media queries.

## Architecture rules
- All fetches go through `fetchWithTimeout()` (6s abort by default; TCG calls use `TCG_TIMEOUT` 12s / `TCGDEX_TIMEOUT` 15s). Every live section MUST have an offline fallback; no section may render blank.
- Data: ScrapedDuck (GO events), pokemontcg.io `API` const (cards/sets; automatic failover to TCGdex `TCGDEX`), Limitless TCG (tournaments), PokéAPI (`POKEAPI`, Pokédex, lazy-loaded on first tab open).
- `UPCOMING_SETS` is hand-maintained; write blurbs in our own words.
- Escape dynamic text with `esc()` in new code.
- Do not remove `const API=...` (it was once dropped by a bad edit; `tests/tcg.test.js` guards it). After any edit run `npm test`.

## Legal guardrails (do not relax without asking the owner)
- Facts only; no copied descriptions. One owner-approved exception (Oct 2026): the Today tab's Pokémon of the day shows the game's own Pokédex entry, fetched live from PokéAPI at view time (`SHOW_FLAVOR_TEXT`), credited, never stored in the repo. Do not extend flavor text to other places without asking the owner.
- Card images are hotlinked from pokemontcg.io (or TCGdex's `assets.tcgdex.net` in backup mode), never rehosted. Sprites are hotlinked from PokéAPI's sprite repo (`SHOW_SPRITES=true`, owner's decision) in both the Pokédex and the Pixel Arena minigame, which respects the same flag; never copy sprite files into the repo. The Arena stays free: no ads, no purchases, no prizes. `assets/arena` (generated backgrounds, CC0 effect images) may live in the repo; Pokémon sprites and card art may not.
- Keep the "unofficial fan project" footer and attributions.
- No ads, merch, paywalls, or "Pokémon" in domain/business names.
