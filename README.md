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

- **Community Day** (top of the GO tab): the live or next Community Day from the same feed (`eventType` containing `community-day`), with date, local time window and countdown, featured Pokémon (sprites matched by name through PokéAPI `pokemon/{slug}`, cached; unmatched names get a letter tile), shiny availability, the short bonus lines, Special Research names, and a link to LeekDuck for full details. Bonus disclaimers, research task text and LeekDuck's images are deliberately not imported; starred bonuses get a note in our own words. Other upcoming Community Days are listed below ("Pokémon TBA" until announced). If the feed is unreachable the section says so instead of showing sample data. ScrapedDuck's terms ask for credit to ScrapedDuck and LeekDuck (both in the footer) and no paywall/ads. Covered by `tests/community-day.test.js`.

### TCG Sets
- **Set/card browser** — live against the [pokemontcg.io](https://pokemontcg.io) API (`api.pokemontcg.io/v2`). Card images hotlink from their CDN (no rehosting). **Cards flip:** tap a card (or Enter/Space) and it turns over with a 3D animation to show its price on the back (`.tflip`; animation is disabled for `prefers-reduced-motion`). In TCGdex backup mode the price is looked up when the card is flipped. **Card images on iPhone:** native `loading="lazy"` can fail to fire for images inside the 3D flip card on iPhone Safari, so the page loads them itself (`startCardImages()`: first 12 immediately, the rest via an IntersectionObserver on the outer `.tcard`, 600px ahead). The front face carries `rotateY(0deg)` (Safari backface workaround), image boxes don't depend on `aspect-ratio` support, a failed TCGdex `.webp` retries as `.png`, and a broken image falls back to the placeholder art. Covered by `tests/card-images.test.js` (iPhone emulation in Chromium; real Safari isn't available in CI).
  The sets list and each set's cards are cached in `sessionStorage` (keys `td-tcg-sets-v1`, `td-tcg-cards-v1-<setId>`; only the fields the page uses are stored), so each is fetched at most once per browser session. Bump the `-v1` suffix if the stored shape changes.
  **Prices:** each card shows a market price taken from the `tcgplayer.prices` (USD, `market` else `mid`, first variant that has one) or, failing that, `cardmarket.prices` (EUR, `trendPrice`) fields that pokemontcg.io already bundles with every card — no extra API or key. See `cardPrice()`. Hover shows source and last-updated date. Prices are cached with the cards for the session (`cards-v3-` keys). In TCGdex backup mode prices are not in the card list, so each card's price is fetched lazily from `api.tcgdex.net/v2/en/cards/<id>` (`pricing.tcgplayer.*.marketPrice`, else `pricing.cardmarket.trend`) as the card scrolls into view, 4 at a time, and cached per card (`td-tcg-price-v1-<id>`; `0` = no price listed). The TCGdex field names were taken from its docs, not from a live response — verify against a real one if prices stay blank. A footer line says they are estimates, not offers to sell. An eBay-style source would need a server-side function to hold its secret key; not built.
  **Price tools:** a "Sort" dropdown (card number / price high→low / price low→high; unpriced cards always last), a **Set value** line (sum of market prices, USD and EUR kept separate, with "N of M cards priced"), and — in TCGdex backup mode — a **LOAD ALL PRICES** button that prices the whole set in the background (4 requests at a time, 3 attempts each, progress shown). TCGdex lookups are remembered in `localStorage` for 6 hours (`td-pc1-<cardId>`; `0` = looked up, none listed), so repeat visits are instant. Only positive numbers count as prices (sources use `null`/`0` for "no data"). TCGdex field shapes were verified against a real card JSON (`pricing.tcgplayer.<variant>.marketPrice`, `pricing.cardmarket.trend`); note TCGdex has had Cardmarket mismatches on some cards, so prices are estimates.
  **Backup source:** if pokemontcg.io fails or times out (12s), the tab switches to [TCGdex](https://tcgdex.dev) (`api.tcgdex.net/v2/en`; images hotlinked from `assets.tcgdex.net`, never rehosted) and stays on it for the session (`td-tcg-source`). TCGdex's set list has no release dates, so it is shown in reverse API order and the status line reads "N cards · via TCGdex". Its card list has no rarity/HP. Sample placeholder cards only appear if both sources fail. `tests/tcg-backup.test.js` covers the failover.
- **My Binder** (TCG tab → MY BINDER; stage 1, no accounts): flip a card and tap **+ ADD TO BINDER** (tap again to remove). Binders show pages of 9 pockets (3×3) with swipe or ◀ ▶ paging and a page-turn animation, card count, value (sum of the price snapshot taken when each card was added) and per-set completion ("Set: 42 / 190"). Tap a pocket for details, move left/right, remove, or move to another binder. Several binders (NEW / RENAME / DELETE with a second-tap confirm). Saved in `localStorage` under `td-binders-v1` (card id, name, set, image URL, price snapshot only; images stay hotlinked). **EXPORT** downloads a JSON file, **IMPORT** loads one (sanitized; only `https://` image URLs kept). **SHARE LINK** encodes binders of up to 40 cards into `#binder=...`; opening it shows a read-only view with SAVE A COPY. Stage 2 (accounts and cloud sync via Supabase) is not built. Covered by `tests/binder.test.js`.
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
First tab and the default view: the live or next GO event with countdown, the live or next Community Day (featured Pokémon, shiny marker, time window, countdown; "CD DETAILS" jumps to the GO tab section; says it is waiting while the feed loads or is unreachable) (from the same ScrapedDuck data as the GO tab), a deterministic Pokémon of the day (`(dayIndex*7919)%1025+1`, one `pokemon/{id}` request through `loadDexDetail`, offline falls back to `DEX_SAMPLE`), the species' category and the latest English Pokédex entry (`pokemon-species/{id}`, soft hyphens joined, breaks collapsed, credited with the game version and "via PokéAPI"; cached in `sessionStorage`; switch: `SHOW_FLAVOR_TEXT`), the next entry in `UPCOMING_SETS` (latest one if none are in the future), and a card promoting the Arena. Buttons jump to the other tabs; "View in Pokédex" pre-fills the Pokédex search. The Pokédex species *list* is still lazy (only fetched when that tab opens).

### Card detail view (TCG tab)
The ⤢ button on each card front opens a full-screen dialog (`#card-detail`): the large card image (hotlinked: pokemontcg.io `_hires` / TCGdex `high.webp`, falling back to the small image), facts only (set, number of printed total, rarity, card type, HP, illustrator; never attack or flavor text), the price, and a price-history chart from `prices/` (2px line, low/high and first/last date labels, crosshair + tooltip on hover/tap, summary line, and a "Show price table" view). ADD TO BINDER (`window.binderToggleCard`) and SHARE (Web Share or copy) a deep link `/tcg?set=<setId>&card=<cardId>`, which opens the dialog on load. ◀ ▶, arrow keys and horizontal swipes walk the grid's current filter/sort order; Escape, ✕ or a tap on the backdrop closes it. Card cache key is `cards-v4` (the API fetch now keeps the large image URL and those facts). Covered by `tests/card-detail.test.js`.

### Card price history (sparklines)
- `.github/workflows/prices.yml` runs `scripts/snapshot-prices.mjs` three times each morning (07:41, 08:41, 09:41 UTC; each run has a 40-minute budget, skips sets already saved that day, and does sets from the last 2 years first, then the stalest): it reads every card's TCGplayer market price from the pokemontcg.io API (same rule as `cardPrice()`, USD only) and appends today's value to `prices/<YYYY-MM>/<setId>.json` (`{"days":[...],"cards":{"<id>":[price|null,...]}}`, one card per line), plus `prices/latest.json` (which sets each month has). Past months are never rewritten. Sets are fetched one at a time; a set that keeps erroring is retried once, then skipped for the day. The job fails without writing if most sets error. Optional repo secret `POKEMONTCG_API_KEY` speeds it up (without it the job waits ~2s between pages to stay under the free rate limit).
- The TCG tab loads the last 3 months for the open set (main source only; TCGdex card ids differ) and draws a small trend line with the % change on the card back once a card has 2+ days of history. Missing/offline files just leave the normal price.
- Prices only (numbers) are stored, no card text or images. Covered by `tests/price-history.test.js`.

### Raid bosses (GO tab)
Current raid bosses from ScrapedDuck's `raids.json` (same two mirrors as the events feed; structured fields only: name, tier, types, CP range, boosted weather, shiny), grouped by tier (5-star and Mega open, 3-star/1-star folded). Each card shows the boss's best attack type(s) using the type checker's GO multipliers, and **COUNTERS** fills the type checker with the boss's own types (`window.tcShow`), so regional and Mega forms are right. Sprites are hotlinked from PokéAPI when the name matches a Pokédex entry (Mega/Shadow/form suffixes stripped; `SHOW_SPRITES` respected); otherwise a type-coloured letter. LeekDuck images are never used. Offline: a note pointing to the type checker. Covered by `tests/raids.test.js`.

### GO type checker (GO tab)
Type a Pokémon name (suggestions from `assets/pokedex-names.json`) or pick one or two types to see what it's weak to and what it resists, using GO's multipliers (×1.6 / ×0.625 / ×0.39 for "immune", multiplied for dual types: ×2.56, ×0.244…). The type chart (`TYPE_CHART`, `goTypeMult()`) is plain game fact data in `index.html`; if the name list can't load, the type pickers still work. Links to the Pokémon's static Pokédex page. Covered by `tests/types.test.js`.

### Who's That Pokémon? (Today tab)
One daily puzzle for everyone (same Pokémon worldwide, changes at 00:00 UTC; numbered from Oct 12 2026). The sprite is shown as a black silhouette on a light card (CSS `brightness(0)` on the sprite only, inside `.whos-frame`; hotlinked, "?" tile if it can't load or `SHOW_SPRITES` is off). Five guesses with name suggestions; each wrong guess shows Gen (↑/↓), Type (✓ / ~ partial / ✗) and Pokédex number (↑/↓) feedback, plus up to three hints — Generation (region), Type, first letter — from a HINT button any time, or unlocked automatically after 2/3/4 misses (saved in `state.hints`; the share text adds 💡N when the button was used). Win/lose reveals the Pokémon (confetti on a win), links to its Pokédex page, tracks streaks in `localStorage` (`td-whos-v1`, `td-whos-stats-v1`) and offers a spoiler-free emoji share text (Web Share or clipboard). Names load from `assets/pokedex-names.json`, generated by `scripts/build-pages.mjs` (`file://` previews can't fetch it and show a message instead). Covered by `tests/puzzle.test.js`.

### Pack opening (TCG tab → OPEN PACKS) and holo shine
- Opens a 10-card pack from the set chosen in BROWSE SETS: 5 commons, 3 uncommons, a reverse-holo slot and a rare slot rolled by tier (Rare 70 / Holo-Double 15 / Ultra 6 / Illustration 6 / Special-Hyper 3, among the tiers the set has). Sets without enough commons (promos, unrated TCGdex data) give 10 random cards, rarest last. These are fun odds, not official pull rates; free, no purchases. Our own pack and card-back art (never the official card back).
- Tear animation, tap-to-flip reveal (rarest last) with a banner and confetti for Ultra Rare and up, summary with best pull and pack value (from loaded prices), ADD ALL / ADD BEST TO BINDER, OPEN ANOTHER, and stats (`td-packs-v1`: packs opened, best pulls).
- **Holo shine:** rare cards (rarity tier ≥ 3 via `rarityTier()`) get a rainbow glare that follows the finger/mouse (`.holo`), in the TCG grid, pack reveals (with tilt and a slow shimmer) and pack summaries. Reduced motion keeps it static.
- Covered by `tests/packs.test.js` (also simulates 400 packs to check the odds). `tests/serve.js` is the shared local server for HTTP tests.

### Pixel Arena
Solo battle-royale minigame on a `<canvas>` (single page, no backend). Pick a fighter from a 24-species roster (`ROSTER`) and an arena, then outlast 11 computer-controlled rivals while a red zone shrinks; the last one standing wins.
- **Look (ported from the separate battle-royale project):** four arena backgrounds (`assets/arena/{indigo,forest,volcano,glacier}.webp`, original generated art, center-cropped to 512x512 and recompressed to ~30 KB each; "today's pick" rotates daily at UTC midnight), Black/White-era sprites (static, up to gen 5, default front sprite otherwise), jump-style attacks (wind-up, hop, contact, return; `KF` keyframes), Showdown effect sprites per type (`assets/arena/fx`, CC0, see `THIRD-PARTY-NOTICES.md`), type-colored impact bursts, damage popups (gold "!" for super effective, grey for resisted), KO rings, a winner podium with medal, and a Poké Ball START button. `prefers-reduced-motion` turns off the jump pose, claw slashes and most particles.
- **Spectate:** when you are knocked out the match keeps going (HUD says SPECTATING); **SKIP TO RESULT** fast-forwards to the winner and the podium shows the real top three.
- **Data:** fighter stats and types come from PokéAPI through the Pokédex's `loadDexDetail()` (HP/attack/defense/speed drive the fight; the standard type chart in `CHART` drives damage multipliers, floored at 0.25x so nothing is fully immune). Offline, the 5 `DEX_SAMPLE` species are used.
- **Sprites:** hotlinked from PokéAPI's sprite repo and drawn only when `SHOW_SPRITES` is true; otherwise fighters are original type-colored discs with a letter. Never copy sprite files into the repo. Arena art and effect images in `assets/arena` are fine to commit (they are not Pokémon character art).
- **Controls:** drag on the arena (touch or mouse) or WASD / arrow keys; fighters auto-aim and auto-attack. Healing orbs spawn in the zone. Leaving the tab stops the game.
- **Tests:** `tests/arena.test.js` (offline + mocked PokéAPI, plus a spectate/podium scenario) plays to a result using a small `window.__arena` test hook; because a `file://` page taints its own canvas, it counts colours in a screenshot instead of calling `getImageData`. Header tab labels shorten to GO / TCG / DEX on phones so five tabs fit.
- **Not built:** online multiplayer, queues and XP (the battle-royale project has these, backed by a Cloudflare Worker + D1 database; a port would need a backend or Supabase), a full-species picker, weather and per-arena type bonuses.

## SEO
- **Tab URLs:** each tab has a real address — `/` (Today), `/go`, `/tcg`, `/pokedex`, `/arena`. `go.html`, `tcg.html`, `pokedex.html` and `arena.html` are **generated** copies of `index.html` (`npm run pages` → `scripts/tab-pages.mjs`) whose `<head>` carries that tab's title, description, canonical and social card, because link previewers don't run JavaScript; Vercel's `cleanUrls` serves `/tcg` from `tcg.html`. Never edit them by hand — edit `index.html` and rerun `npm run pages` (`npm test`/CI fails if they're stale). In the app, tab clicks update the URL with `history.pushState` (back/forward work) and the same `ROUTES` table keeps the tags in sync. Shared-binder links (`#binder=…`) keep their code when the page jumps to `/tcg`. Local `file://` previews skip URL changes.
- **Social cards:** `assets/og-image.jpg` (home) plus `og-go`, `og-tcg`, `og-pokedex`, `og-arena` (1200×630, original art: arena backgrounds + text, no Pokémon artwork). Regenerate with `python3 scripts/make-og-images.py` (Pillow + DejaVu fonts); edit the `CARDS` table there to change wording.
- **Head:** canonical (`https://www.trainerdesk.net`), robots `max-image-preview:large`, Open Graph + `summary_large_image` Twitter card with `assets/og-image.jpg` (1200×630, original art: arena background + text, no Pokémon artwork), JSON-LD (`WebSite` + free `WebApplication` with a feature list), `<noscript>` summary, apple-touch icon and `site.webmanifest` (installable icons in `assets/icons`).
- **Files:** `sitemap.xml` (all five routes), `robots.txt` (points at the sitemap), `404.html` (noindex, links back to each tab).
- **After deploy:** add the site in Google Search Console (and Bing Webmaster Tools), verify the domain, and submit `https://www.trainerdesk.net/sitemap.xml`. Keep `ROUTES` titles ≤ 65 characters and descriptions 70–165; `tests/seo.test.js` enforces this and serves the site over HTTP with the same rewrites.

## Static pages (Pokédex + TCG sets)
- **Pokémon pages** at `/pokedex/<slug>` (1,025, e.g. `/pokedex/pikachu`): number, category, types, region/generation, base stats with total, type matchups (weak/resist/immune incl. ×4/×¼), abilities (hidden flagged), size, habitat, catch rate, evolution chain, a "Pokémon TCG cards" section (how many English cards feature it, linking to its most recent sets), previous/next, same-type Pokémon, a generated summary and links back into the app. The interactive Pokédex detail panel links to each page.
- **Set pages** at `/tcg/<slug>` (176 English sets, e.g. `/tcg/pitch-black`, `/tcg/phantasmal-flames`): series, release date, set code, main-set and secret-rare counts, Standard/Expanded legality, cards by rarity and by Pokémon type, the full card list with hotlinked images (Pokémon cards link to their Pokédex page), top illustrators, previous/next set and other sets in the series. "See live prices & add cards to your binder" opens `/tcg?set=<id>` in the app (the TCG tab honours `?set=`). **`/tcg/sets`** lists every set by series and is linked from the TCG tab.
- **Facts only:** no Pokédex flavor text; the TCG dataset's flavor and attack text are never stored. Sprites and card images are hotlinked (sprites respect `SHOW_SPRITES`). Each page has its own title, description, canonical, breadcrumb structured data and the matching social card. Analytics only for visitors who already accepted cookies on the main site.
- **How:** `scripts/fetch-pokedex-data.mjs` (PokéAPI's open CSV data → `data/pokedex.json`) and `scripts/fetch-tcg-data.mjs` (github.com/PokemonTCG/pokemon-tcg-data → `data/tcg.json`), then `scripts/build-pages.mjs` writes `pokedex/`, `tcg/` and `sitemap.xml` (`npm run data` does all three; `npm run static-pages` only rebuilds). Generated files are committed and served as-is (`cleanUrls`); stale pages are removed on rebuild. `.github/workflows/refresh-data.yml` refreshes both datasets every Monday and commits changes, which redeploys.
- **Tests:** `tests/pokedex-pages.test.js` and `tests/tcg-pages.test.js` (up to date, facts, links, title/description limits, 320px layout, the `?set=` deep link).

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

- **Daily Challenge:** one shared match per UTC day (numbered from Oct 17 2026). `dailyPlan(day)` picks the fighter, 11 rivals and arena from a seeded generator, and the match itself uses a seeded `rnd()` (instead of `Math.random`) so everyone gets the same line-up and spawns; your moves still decide the result. The first finish counts (`td-arena-daily-v1`) and gets a spoiler-free share text (e.g. `Pixel Arena Daily #3 🥈 2nd/12 · 3 KOs · 52s`); later runs that day are labelled practice. A run only counts if all 12 planned fighters load from PokéAPI; the offline sample line-up is always practice.
- **Special moves:** every fighter has one, set by its primary type (`SPECIAL_OF`): BURST (fire, dragon, rock, ground, fighting, poison, normal: blast everyone close by), WAVE (water, ice: push rivals away; ice also slows), DASH (electric, flying: zip ~130px through rivals), HEAL (grass, fairy, bug: +35% HP), PHASE (ghost, dark: untouchable for 2.5s), BARRAGE (psychic, steel: 10 shots in every direction). The SPECIAL button under the arena fills as it charges (8s; first charge 3s) and pulses when ready; Space or E also work. Rivals use theirs at sensible moments on a slower 14s charge. Special KOs count toward your KOs. Covered by `tests/arena-special.test.js`.
- **Trainer record:** saved on this device (`td-arena-stats-v1`): matches, wins and win rate, best place, total KOs, win streak, daily streak, and best (or most played) fighter. Each match shows a result card with placing, KOs, damage dealt and time survived. Nothing to buy or win. Covered by `tests/arena-daily.test.js`.
