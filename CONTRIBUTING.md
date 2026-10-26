# Contributing to Alea Agent

Thank you for interest in Alea. This repo is a **hackathon submission** (Open Agent Hackathon 2026). Contributions during the event should stay aligned with the product spine and honesty rules below.

## Product spine (do not break)

1. Domain → symbol → (window if any) → threshold/tolerance  
2. Three sources, one metric  
3. Aligned → **Allowed**  
4. Conflict/partial → **No claim** → **Write confession**  
5. Confession → rule in memory  
6. Same pattern → **Refused** (cite confession)  

Alea **never averages** conflicting sources into a fake truth.

## How to contribute

1. Open an issue or coordinate on the team channel before large changes.  
2. Branch from `main` (`git checkout -b yourname/short-topic`).  
3. Keep SAMPLE fixtures deterministic (no user-editable fixtures for judge demos).  
4. Run tests before opening a PR:

```bat
npm test
npm run typecheck
```

5. Prefer small PRs: one feature or fix per PR when possible.

## Code style

- TypeScript, ESM (`"type": "module"`).  
- Match existing naming in `src/domains.ts`, agents, and `public/alea.js`.  
- Do not log secrets or API keys.  
- Plain-English user-facing strings (templates / UI); no internal codes in the first sentences of confessions.

## Testing guidelines

- Add or extend tests under `test/` for new domains, windows, or rule behavior.  
- Window isolation: a confession on `symbol · metric A` must not refuse `symbol · metric B`.  
- Live fetchers: prefer honest **partial** over invented series when an API lacks a field.  
- See [docs/testing.md](docs/testing.md) for the full smoke script and judge path.

## File ownership (team)

| Area | Typical owner |
|------|----------------|
| UI (`public/alea.js`), fixtures, packs tests, sports, windows | Feature lane (e.g. Toby) |
| Nightshift prose, news pack, deep Zetaris | Coordinate before dual-editing `domains.ts` / `orchestrator.ts` |

## Reporting issues

Include: OS, Node version, `SAMPLE_MODE`, steps to reproduce, expected vs actual, and whether `npm test` passes.
