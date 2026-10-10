# Trainer Desk

An unofficial Pokémon GO + Pokémon TCG information hub, styled with a
GBA-era "Pokémon Emerald" color and UI treatment (forest greens, cream
dialogue-box panels, pixel/retro typography). Single-file static site,
currently deployed to Vercel.

**Live:** https://www.trainerdesk.net

## What's in here

Everything lives in `index.html` — HTML, CSS, and JS in one file, no
build step. Three tabs:

### GO Events
Live event calendar (raids, community days, spotlight hours, research)
with real-time countdowns. Data comes from the community-maintained
[ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) feed, which scrapes
structured event data (titles/dates/type) from LeekDuck's public events
page. We deliberately only pull structural fields and write our own
copy — no imported descriptions — then link each card back to the
original source for full details.

- Primary feed: `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json`
- Fallback mirror: jsDelivr CDN (same repo)
- Falls back to hardcoded sample events if both are unreachable or time out

### TCG Sets
- **Set/card browser** — live against the [pokemontcg.io](https://pokemontcg.io) API (`api.pokemontcg.io/v2`). Card images hotlink from their CDN (no rehosting).
- **Upcoming Sets** — hand-maintained array (`UPCOMING_SETS` in the script). No public API exists for pre-release set announcements; update this manually from pokemon-card.com (Japan) or official English press when a new set is confirmed. Write descriptions in your own words.
- **Recent Tournaments** — live against [Limitless TCG's](https://limitlesstcg.com) public API (`play.limitlesstcg.com/api/tournaments`), the platform the competitive community uses for standings/decklists.
- **Offline placeholder art** — when the live card API is unreachable, sample cards render original generated SVG placeholders (gradient + monogram + rarity dots), not real card art.

### Pokédex
Searchable species list backed by [PokéAPI](https://pokeapi.co) (`pokeapi.co/api/v2`, free, no key).

- **List:** `GET /pokemon-species?limit=1` to read the current species `count`, then `GET /pokemon-species?limit=<count>` — so new generations appear without a code change. Cached in `sessionStorage` (key `td-dex-list-v1`).
- **Detail:** `GET /pokemon/{id}` on click (species id == default-form pokemon id). Cached in memory per session. Only factual fields are displayed: types, base stats, abilities (hidden flagged), height, weight.
- **Filters:** name/number search (`pika`, `#025`, `25`) and a generation dropdown. Generations are static id ranges in `GEN_RANGES` (Gen 9 is open-ended, so ids past 1025 land there).
- **Lazy:** nothing is fetched until the Pokédex tab is first opened. PokéAPI asks clients to cache, which is why the list and details are cached as above.
- **Offline:** if the API is unreachable, 5 hand-entered species (Bulbasaur, Charmander, Squirtle, Pikachu, Eevee) render so the tab is never blank; re-opening the tab retries the live API.
- **Names:** display names come from slugs via `prettyName()`, with `DEX_NAME_OVERRIDES` / `DEX_HYPHEN_KEEP` for the awkward ones (Mr. Mime, Ho-Oh, Type: Null…). Add entries there if you spot a mangled name.
- **Not imported on purpose:** Pokédex flavor-text entries (that's the games' own prose — write your own if you want descriptions) and sprites (see below).

## Network resilience

All `fetch()` calls go through `fetchWithTimeout()` (6s AbortController
timeout) so a silently-hung request — not just an outright failure —
can't block the fallback data from rendering. Every live section has a
synchronous or timed-out fallback; nothing should ever render fully blank.

## Copyright / legal notes (read before extending)

This project intentionally stays in "informational/editorial fan site"
territory, similar to LeekDuck, Serebii, or PokéBeach:

- **No official Pokémon character art or game assets** are used anywhere, including in placeholders — those are original generated SVGs.
- **Card images** are hotlinked from pokemontcg.io's own CDN under their API's terms, not rehosted.
- **No real WWE wrestlers or trademarked characters** — n/a for this project, but was a hard boundary on a related project (SLAMDEX) in the same account.
- Don't put "Pokémon" in a business/domain name, don't sell access, don't use official branding more prominently than the site's own identity, and keep the "unofficial fan project" disclaimer in the footer.
- **Pokédex sprites are ON** (`SHOW_SPRITES = true` in the script; set to `false` for original monogram tiles). PokéAPI's data is factual and fine to use, but the sprite URLs in its `sprites` field point at the games' official art, which is copyrighted. The default tiles use an original monogram instead. Flipping the flag hotlinks PokéAPI's sprite repo (same hotlink-don't-rehost approach as the TCG card images) — that's a judgment call for you as the site owner, not something this code endorses as risk-free. Never copy those files into this repo.

## Known TODOs / next steps

- [ ] Wire the homepage "Full card & countdown" button on other pages if this gets split into a multi-page site
- [ ] Consider swapping `raw.githubusercontent.com` for the jsDelivr mirror as primary if CORS reliability becomes an issue
- [ ] Rarity-tier colors and the type-color hash function are both in-script; move to a shared config object if this grows
- [ ] No build tooling yet — if this becomes a multi-page site, consider Astro or plain Vite for a dev server + bundling, keeping the "static, no backend" architecture

## Deploying

Deployed on Vercel (project `trainer-desk-4n8w`), connected to this repo
through the GitHub integration: every push to `main` deploys to
production at www.trainerdesk.net, and other branches get preview URLs.
Run `npm test` before pushing.
