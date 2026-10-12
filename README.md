# Trainer Desk

An unofficial Pokémon GO + Pokémon TCG information hub, styled with a
GBA-era "Pokémon Emerald" color and UI treatment (forest greens, cream
dialogue-box panels, pixel/retro typography). Single-file static site,
currently deployed to Vercel.

**Live:** https://www.trainerdesk.net

## What's in here

Everything lives in `index.html` — HTML, CSS, and JS in one file, no
build step. Four tabs (GO Events, TCG Sets, Pokédex, Pixel Arena); the first three are described below:

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
- **Set/card browser** — live against the [pokemontcg.io](https://pokemontcg.io) API (`api.pokemontcg.io/v2`). Card images hotlink from their CDN (no rehosting). **Cards flip:** tap a card (or Enter/Space) and it turns over with a 3D animation to show its price on the back (`.tflip`; animation is disabled for `prefers-reduced-motion`). In TCGdex backup mode the price is looked up when the card is flipped. **Card images on iPhone:** native `loading="lazy"` can fail to fire for images inside the 3D flip card on iPhone Safari, so the page loads them itself (`startCardImages()`: first 12 immediately, the rest via an IntersectionObserver on the outer `.tcard`, 600px ahead). The front face carries `rotateY(0deg)` (Safari backface workaround), image boxes don't depend on `aspect-ratio` support, a failed TCGdex `.webp` retries as `.png`, and a broken image falls back to the placeholder art. Covered by `tests/card-images.test.js` (iPhone emulation in Chromium; real Safari isn't available in CI).
  The sets list and each set's cards are cached in `sessionStorage` (keys `td-tcg-sets-v1`, `td-tcg-cards-v1-<setId>`; only the fields the page uses are stored), so each is fetched at most once per browser session. Bump the `-v1` suffix if the stored shape changes.
  **Prices:** each card shows a market price taken from the `tcgplayer.prices` (USD, `market` else `mid`, first variant that has one) or, failing that, `cardmarket.prices` (EUR, `trendPrice`) fields that pokemontcg.io already bundles with every card — no extra API or key. See `cardPrice()`. Hover shows source and last-updated date. Prices are cached with the cards for the session (`cards-v3-` keys). In TCGdex backup mode prices are not in the card list, so each card's price is fetched lazily from `api.tcgdex.net/v2/en/cards/<id>` (`pricing.tcgplayer.*.marketPrice`, else `pricing.cardmarket.trend`) as the card scrolls into view, 4 at a time, and cached per card (`td-tcg-price-v1-<id>`; `0` = no price listed). The TCGdex field names were taken from its docs, not from a live response — verify against a real one if prices stay blank. A footer line says they are estimates, not offers to sell. An eBay-style source would need a server-side function to hold its secret key; not built.
  **Price tools:** a "Sort" dropdown (card number / price high→low / price low→high; unpriced cards always last), a **Set value** line (sum of market prices, USD and EUR kept separate, with "N of M cards priced"), and — in TCGdex backup mode — a **LOAD ALL PRICES** button that prices the whole set in the background (4 requests at a time, 3 attempts each, progress shown). TCGdex lookups are remembered in `localStorage` for 6 hours (`td-pc1-<cardId>`; `0` = looked up, none listed), so repeat visits are instant. Only positive numbers count as prices (sources use `null`/`0` for "no data"). TCGdex field shapes were verified against a real card JSON (`pricing.tcgplayer.<variant>.marketPrice`, `pricing.cardmarket.trend`); note TCGdex has had Cardmarket mismatches on some cards, so prices are estimates.
  **Backup source:** if pokemontcg.io fails or times out (12s), the tab switches to [TCGdex](https://tcgdex.dev) (`api.tcgdex.net/v2/en`; images hotlinked from `assets.tcgdex.net`, never rehosted) and stays on it for the session (`td-tcg-source`). TCGdex's set list has no release dates, so it is shown in reverse API order and the status line reads "N cards · via TCGdex". Its card list has no rarity/HP. Sample placeholder cards only appear if both sources fail. `tests/tcg-backup.test.js` covers the failover.
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
- **Flavor text:** not shown in the Pokédex tab (it is the games' own prose). The one exception, approved by the site owner in Oct 2026, is the Today tab's Pokémon of the day (see Today above).

### Today (landing view)
First tab and the default view: the live or next GO event with countdown (from the same ScrapedDuck data as the GO tab), a deterministic Pokémon of the day (`(dayIndex*7919)%1025+1`, one `pokemon/{id}` request through `loadDexDetail`, offline falls back to `DEX_SAMPLE`), the species' category and the latest English Pokédex entry (`pokemon-species/{id}`, soft hyphens joined, breaks collapsed, credited with the game version and "via PokéAPI"; cached in `sessionStorage`; switch: `SHOW_FLAVOR_TEXT`), the next entry in `UPCOMING_SETS` (latest one if none are in the future), and a card promoting the Arena. Buttons jump to the other tabs; "View in Pokédex" pre-fills the Pokédex search. The Pokédex species *list* is still lazy (only fetched when that tab opens).

### Pixel Arena
Solo battle-royale minigame on a `<canvas>` (single page, no backend). Pick a fighter from a 24-species roster (`ROSTER`) and an arena, then outlast 11 computer-controlled rivals while a red zone shrinks; the last one standing wins.
- **Look (ported from the separate battle-royale project):** four arena backgrounds (`assets/arena/{indigo,forest,volcano,glacier}.webp`, original generated art, center-cropped to 512x512 and recompressed to ~30 KB each; "today's pick" rotates daily at UTC midnight), Black/White-era sprites (static, up to gen 5, default front sprite otherwise), jump-style attacks (wind-up, hop, contact, return; `KF` keyframes), Showdown effect sprites per type (`assets/arena/fx`, CC0, see `THIRD-PARTY-NOTICES.md`), type-colored impact bursts, damage popups (gold "!" for super effective, grey for resisted), KO rings, a winner podium with medal, and a Poké Ball START button. `prefers-reduced-motion` turns off the jump pose, claw slashes and most particles.
- **Spectate:** when you are knocked out the match keeps going (HUD says SPECTATING); **SKIP TO RESULT** fast-forwards to the winner and the podium shows the real top three.
- **Data:** fighter stats and types come from PokéAPI through the Pokédex's `loadDexDetail()` (HP/attack/defense/speed drive the fight; the standard type chart in `CHART` drives damage multipliers, floored at 0.25x so nothing is fully immune). Offline, the 5 `DEX_SAMPLE` species are used.
- **Sprites:** hotlinked from PokéAPI's sprite repo and drawn only when `SHOW_SPRITES` is true; otherwise fighters are original type-colored discs with a letter. Never copy sprite files into the repo. Arena art and effect images in `assets/arena` are fine to commit (they are not Pokémon character art).
- **Controls:** drag on the arena (touch or mouse) or WASD / arrow keys; fighters auto-aim and auto-attack. Healing orbs spawn in the zone. Leaving the tab stops the game.
- **Tests:** `tests/arena.test.js` (offline + mocked PokéAPI, plus a spectate/podium scenario) plays to a result using a small `window.__arena` test hook; because a `file://` page taints its own canvas, it counts colours in a screenshot instead of calling `getImageData`. Header tab labels shorten to GO / TCG / DEX on phones so five tabs fit.
- **Not built:** online multiplayer, queues and XP (the battle-royale project has these, backed by a Cloudflare Worker + D1 database; a port would need a backend or Supabase), a full-species picker, weather and per-arena type bonuses.

## Network resilience

All `fetch()` calls go through `fetchWithTimeout()` (6s default AbortController; the TCG calls use 12s/15s because pokemontcg.io is slow
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
