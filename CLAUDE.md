# Trainer Desk — instructions for Claude Code

Unofficial Pokémon GO + TCG + Pokédex info site, Pokémon Emerald (GBA) look.
**Single static file: `index.html`** (HTML+CSS+JS inline). No build step, no framework, no backend. Keep it that way unless asked.

## Commands
- `npm install && npx playwright install chromium` (once)
- `npm run dev` → http://localhost:3000
- `npm test` → Playwright suites (network is mocked/aborted; no live calls)
- Deploy = push to `main` (Vercel project `trainer-desk-4n8w`, www.trainerdesk.net; see HANDOFF.md)

## Architecture rules
- All fetches go through `fetchWithTimeout()` (6s abort). Every live section MUST have an offline fallback; no section may render blank.
- Data: ScrapedDuck (GO events), pokemontcg.io `API` const (cards/sets), Limitless TCG (tournaments), PokéAPI (`POKEAPI`, Pokédex, lazy-loaded on first tab open).
- `UPCOMING_SETS` is hand-maintained; write blurbs in our own words.
- Escape dynamic text with `esc()` in new code.
- Do not remove `const API=...` (it was once dropped by a bad edit; `tests/tcg.test.js` guards it). After any edit run `npm test`.

## Legal guardrails (do not relax without asking the owner)
- Facts only. No Pokédex flavor text, no copied descriptions.
- Card images are hotlinked from pokemontcg.io, never rehosted. Sprites are hotlinked from PokéAPI's sprite repo (`SHOW_SPRITES=true`, owner's decision); never copy sprite files into the repo.
- Keep the "unofficial fan project" footer and attributions.
- No ads, merch, paywalls, or "Pokémon" in domain/business names.
