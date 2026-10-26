# Changelog

All notable changes to Alea Agent are documented here.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/). Versioning follows the app `package.json` version during the hackathon.

## [0.1.0] — 2026-10-26

### Added

- Multi-domain packs: crypto, equities, forex, defi, tvl, weather, **sports** (SAMPLE `home_win_prob`).  
- **Time windows:** crypto `1h` / `1d` / `7d` / `30d`; equities `1d` / `7d` / `30d`; weather `now` / `7d` (7-day mean).  
- Metric-scoped rule matching so confessions isolate by window (e.g. SOL · 1d ≠ SOL · 7d).  
- Main UI window selector, Force conflict, Write confession, Ledger (symbol · window).  
- SAMPLE fixtures per symbol × window; sports book fixtures.  
- Sponsor integrations: Zetaris (live SQL path), Meterless H-MEM, Meterless Nightshift.  
- Automated tests: cycle, constraints, packs (windows + sports), judge.  
- Docs: testing (judge path), architecture, zetaris, demo script.

### Fixed

- Allowed UI path no longer reads `refusal` when the claim stands.  
- `existingRule` matches on domain + symbol + **metric**, not domain + symbol only.

### Honesty / design

- Binance non-1d windows → honest partial (no invented 7d/30d).  
- TVL: only DefiLlama live; Token Terminal / DappRadar reserved (`not connected`).  
- Sports v1: SAMPLE-only (no live odds API).

### Docs

- Judge-oriented `docs/testing.md` (smoke script, API checks, live notes).  
- Contributing, changelog, install, usage, API, FAQ, license notice.
