# Handoff — Trainer Desk

**Live:** https://trainerdesk-jacobmiller456-6929.vercel.app (also trainerdesk-two.vercel.app)
**Vercel project:** `trainerdesk` · project id `prj_FztsjZjKPl8iXieC9ItDV654BNII` · team id `team_QVendHk4NLPfiQO7RqvHVE0P` · region iad1
**GitHub:** jacobmiller456/trainer-desk (owner may not have pushed yet)
**Framework preset:** Other (static). No build/install/output settings.

## State
- Tabs: GO Events, TCG Sets, Pokédex. All verified with Playwright (mock + offline).
- Last deployed version = this `index.html` (Pokédex + sprites on + `API` const restored).

## First steps for Claude Code
1. `git init && git add . && git commit -m "Initial import"`; add the GitHub remote and push `main`.
2. `npm install && npx playwright install chromium && npm test` — expect all PASS.
3. Link Vercel: `vercel link` (choose existing project `trainerdesk`), then `vercel --prod`.
4. In Vercel → Settings → Git, connect the repo so pushes auto-deploy. (Optional: make a `production` branch and set it as Production Branch.)

## Known gaps / ideas
- Custom domain not bought yet (avoid "pokemon" in the name; e.g. trainerdesk.com/.app).
- `UPCOMING_SETS` needs manual updates when sets are announced.
- Possible: switch ScrapedDuck primary to the jsDelivr mirror; shared type-color config; add SEO meta/OG tags and favicon.
- No secrets or env vars are used anywhere.
