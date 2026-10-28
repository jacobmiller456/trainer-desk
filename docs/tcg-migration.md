# Plan: replacing pokemontcg.io before March 1, 2027

Status (Oct 28, 2026): **owner approved** — prices from TCGdex, TCGdex images may be the main source, groundwork now and the app switch in early January. Phases 1–2 built (`scripts/fetch-tcgdex.mjs`, run weekly by `refresh-data.yml`). Keep this file updated as phases land.

## Why
- The Pokémon TCG API (pokemontcg.io) goes offline on **March 1, 2027**. Its successor, Scrydex, is paid; new pokemontcg.io sign-ups are closed. Scrydex keeps the old card IDs.
- The open dataset `PokemonTCG/pokemon-tcg-data` (used by `scripts/fetch-tcg-data.mjs` for the TCG set pages) is now described as a historical source, so new sets will likely stop appearing.

## What depends on pokemontcg.io today
| Feature | Uses | After March 1 without changes |
|---|---|---|
| TCG tab browse (sets, cards, prices) | `API` const, automatic failover to TCGdex | keeps working via TCGdex backup (prices load per card on flip) |
| Card images | images.pokemontcg.io (TCGdex assets in backup) | TCGdex images only |
| Daily price saves → history, sparklines, card detail chart, price movers, hub "top riser" | `scripts/snapshot-prices.mjs` (pokemontcg.io) | **stop** (no new data) |
| Card IDs in binders, `prices/` files, deep links `/tcg?set=&card=` | pokemontcg.io IDs (e.g. `sv3pt5-199`) | TCGdex IDs differ (e.g. `sv03.5-199`): old binders/links/history won't match |
| TCG set pages `tcg/<slug>.html`, `data/tcg.json`, pack opener sets | pokemon-tcg-data (GitHub) | new sets missing |

## Phases
1. **ID map** ✅ built: `scripts/fetch-tcgdex.mjs` → `data/tcg-id-map.json` mapping every pokemontcg.io card/set ID to its TCGdex ID (match sets by name + release date + card count, cards by number; report anything unmatched for hand-fixing).
2. **Set data** ✅ built: sets newer than the pokemon-tcg-data snapshot are added from TCGdex (`src:"tcgdex"`, cached in `data/tcgdex-sets.json`), so new sets keep getting pages. Their `/tcg?set=` button only works once phase 4 lands.
3. **Prices** (decision: TCGdex; sets from the last ~2–3 years daily, older sets weekly): new daily snapshot source, writing the same `prices/<month>/<set>.json` format (keyed by TCGdex IDs, old files converted with the ID map so history continues).
4. **App switch**: TCGdex becomes the primary card source (pokemontcg.io becomes backup until it's gone); binders, deep links and price lookups translate old IDs through the map on load (no data loss).
5. **Cut-over** by mid-February 2027: remove pokemontcg.io from the app, scripts and workflows; update CLAUDE.md guardrails (card images then hotlinked from TCGdex as the main source) and tests.

## Owner decisions (decided Oct 28, 2026: A = TCGdex, B = yes, C = groundwork now, switch in early January)
- **A. Price source for the daily saves**
  - *TCGCSV* (recommended if allowed): free daily TCGplayer prices in bulk (one file per set), plus an archive back to Feb 2024 that could backfill years of history. No published terms → email the maintainer to ask (draft ready on request).
  - *TCGdex*: free, no key, but one request per card (~20,000/day) with no published rate limit → would need to be slow and polite (a few hours per run) or limited to recent sets.
  - *Scrydex*: official successor, same IDs, least work, but a monthly fee (conflicts with keeping the site free to run? owner's call).
- **B. Card images**: OK to hotlink TCGdex images as the *main* source (today the guardrail allows them only in backup mode)?
- **C. Timing**: start phases 1–2 now (no risk), switch the app (phase 4) in January.
