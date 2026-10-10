# Handoff — Trainer Desk

**Live:** https://www.trainerdesk.net (apex trainerdesk.net 308-redirects to www; also trainer-desk-4n8w.vercel.app)
**Vercel project:** `trainer-desk-4n8w` · project id `prj_stoGEL5IYR9MSx1GPiFshTNXeO1F` · team id `team_QVendHk4NLPfiQO7RqvHVE0P`
**GitHub:** jacobmiller456/trainer-desk — connected to the Vercel project; every push to `main` deploys to production, other branches get preview URLs.
**Framework preset:** Other (static). No build/install/output settings. `.vercelignore` keeps tests/tooling out of the upload.

## State
- Tabs: GO Events, TCG Sets, Pokédex. All verified with Playwright (mock + offline).
- Production = `main`. SEO/OG meta, favicon, security headers (`vercel.json`) and `robots.txt` are in place.
- Older duplicate projects `trainerdesk` and `trainer-desk` are being retired; don't deploy to them.

## Working on it
1. `npm install && npx playwright install chromium && npm test` — expect all PASS.
2. Commit and push to `main` to ship. No manual `vercel --prod` needed.

## Known gaps / ideas
- `UPCOMING_SETS` needs manual updates when sets are announced.
- Possible: switch ScrapedDuck primary to the jsDelivr mirror; shared type-color config; a social preview image (`og:image`).
- No secrets or env vars are used anywhere.
