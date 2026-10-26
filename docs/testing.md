# Testing Documentation for Alea Agent

**Repo:** https://github.com/thereal-awetoby/aleaagent  
**Mode under test:** `SAMPLE_MODE=true` (full offline loop) and optional live path  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Testing Environment](#2-testing-environment)
3. [Product Path Under Test](#3-product-path-under-test)
4. [Automated Tests](#4-automated-tests)
5. [Manual Smoke Script (Judges / Demo)](#5-manual-smoke-script-judges--demo)
6. [API Checks](#6-api-checks)
7. [Live Mode Notes](#7-live-mode-notes)
8. [Sponsor Stack in Testing](#8-sponsor-stack-in-testing)
9. [Results Expectations](#9-results-expectations)
10. [Do Not / Honesty Rules](#10-do-not--honesty-rules)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Introduction

This document describes how to verify **Alea Agent**: a multi-domain agent that reads the **same metric from three independent sources**, never averages conflict into a fake truth, and on failure **writes a confession + rule** so the **same pattern is refused next time** with a citation.

Testing covers:

- Allow / withhold / confess / refuse loop  
- **Time windows** (crypto, equities, weather) and **rule isolation by metric**  
- **Sports** SAMPLE pack (`home_win_prob`)  
- Domain packs, tolerances, judge, and sponsor adapters (Zetaris, Nightshift, H-MEM)  

Judges can reproduce every claim offline with `SAMPLE_MODE=true` and no API keys.

---

## 2. Testing Environment

| Item | Value |
|------|--------|
| Runtime | **Node.js ≥ 20** |
| Language | TypeScript (run via `tsx`) |
| Test runner | Node.js built-in `node:test` (`npm test` → `tsx --test …`) |
| App | `npm start` → http://localhost:8000 |
| Offline mode | `SAMPLE_MODE=true` (default) |

### Setup

```bat
git clone https://github.com/thereal-awetoby/aleaagent.git
cd aleaagent
npm install
npm run setup
copy .env.example .env
set SAMPLE_MODE=true
```

### Commands

```bat
npm test
npm run typecheck
npm start
```

- **Main UI:** http://localhost:8000/  
- **Classic UI:** http://localhost:8000/classic.html  
- Stop server: `Ctrl+C`  
- Server does not hot-reload; restart after server-side edits. Refresh browser for `public/` changes.

### Dependencies (high level)

- `tsx`, `typescript`, `@types/node` (dev)  
- Meterless **H-MEM** via `npm run setup` → `vendor/hmem`  
- Optional live: Zetaris, Nightshift, Finnhub, Alpha Vantage, Etherscan, OpenWeather (keys in `.env`)

---

## 3. Product Path Under Test

Operator flow in the main UI:

**Domain → Symbol → [Window if shown] → Run → (on conflict) Write confession → Run again → Refused**

| Control | Behavior |
|---------|----------|
| **Domain** | crypto, equities, forex, defi, tvl, weather, sports |
| **Symbol** | From that domain’s seeded list |
| **Window** | Shown when the domain has multiple windows (crypto: 1h/1d/7d/30d; equities: 1d/7d/30d; weather: now/7d) |
| **Force conflict** | SAMPLE: conflict fixtures; live: may skew one reading for the demo loop |
| **Write confession** | After verdict **No claim** (withheld) |
| **Clear memory** | Clears confessions/rules; keeps saved tolerances |

**Force conflict** vs natural: Force always exercises the conflict path for judges. With Force off and aligned fixtures/live agreement → **Allowed**.

Alea **never averages** disagreeing sources into one number.

---

## 4. Automated Tests

### Run

```bat
npm test
npm run typecheck
```

### What the suite covers

| Area | What is asserted |
|------|------------------|
| **Classify** | aligned / conflict / partial; absolute and relative tolerance |
| **Confession loop** | aligned stands; conflict confesses + rule; same pattern refuses with citation; different symbol not blocked |
| **Manual confess** | withhold → `POST /api/confess` → refuse + count |
| **Constraints** | per-domain saved tolerance; reset; survives reload |
| **Domain packs** | symbols, TVL partial honesty (`not connected`), weather cities, forex pairs |
| **Time windows** | crypto/equities/weather windows exposed; **SOL 1d confession does not block SOL 7d** |
| **Crypto 1h** | metric `change_1h` + SAMPLE fixtures |
| **Sports** | EPL-F1 Allowed → withhold → confess → refuse (`R-SPORT`) |
| **Weather 7d** | metric `temp_7d_mean` |
| **Templates / judge** | plain-English confessions; number checks; no leaked reasoning |
| **Zetaris / Nightshift** | request shape / retry / model reporting (contract tests) |

Expect **all tests passing** (on the order of 60+ tests). Memory-related failures usually mean `npm run setup` was skipped.

---

## 5. Manual Smoke Script (Judges / Demo)

Use **Clear memory** between scenarios. Keep **SAMPLE_MODE=true**.

| # | Action | Expected outcome |
|---|--------|------------------|
| 1 | Crypto · **1d** (default) · aligned · Run | **Allowed** — UI must **not** crash |
| 2 | Crypto · **1d** · Force conflict · Run → **Write confession** · Run again | Confession + rule → **Refused** with citation |
| 3 | Crypto · **7d** · Force conflict · Run | **No claim** (must **not** refuse from step 2’s 1d rule) → confess → refuse |
| 4 | Crypto · **1h** · Force conflict (optional) | Withhold → confess path; metric is 1-hour change |
| 5 | Equities · **30d** · Force conflict | SAMPLE full withhold → confess path |
| 6 | Weather · **now** · aligned · Run | **Allowed** |
| 7 | Weather · **7d** · Force conflict · confess | Narrative mentions **7-day** mean → refuse on re-run |
| 8 | Sports · **EPL-F1** · aligned → Force conflict → confess → re-run | Allowed → withhold → refuse |
| 9 | Open **Ledger** | Rows show domain, **symbol · window** where applicable, rule id, refusals |

### Case mapping (design specs)

| Case | Description | Expected |
|------|-------------|----------|
| **Valid / aligned** | Three sources within tolerance | **Allowed** |
| **Conflict** | Sources disagree beyond tolerance | **No claim** → confession + rule (no averaged “truth”) |
| **Confession** | After conflict + Write confession | Structured confession; rule id e.g. `R-CRYPTO-*` / `R-SPORT-*` |
| **Refusal** | Same domain + symbol + **metric** + pattern | **Refused**; cites prior confession |
| **Window isolation** | SOL 1d confessed; then SOL 7d conflict | 7d still withholds first time (rules key on metric) |

---

## 6. API Checks

PowerShell examples (`SAMPLE_MODE=true`, server running):

```powershell
# Aligned crypto 1d
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"1d","scenario":"aligned","manual":true}'

# Conflict crypto 7d
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"7d","scenario":"conflict","manual":true}'

# Sports conflict
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"sports","symbol":"EPL-F1","scenario":"conflict","manual":true}'

# State (domains, rules, confessions)
Invoke-RestMethod http://localhost:8000/api/state
```

After a run with `decision: "withheld"`, confess:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/confess -ContentType application/json -Body '{"cycle_id":"PASTE_CYCLE_ID"}'
```

Then re-run the same domain/symbol/window/scenario → expect `decision: "refuse"`.

---

## 7. Live Mode Notes

Set `SAMPLE_MODE=false` in `.env` and restart only if testing live APIs.

| Path | Expected honesty |
|------|------------------|
| Crypto **1d** | Up to three live sources |
| Crypto **1h / 7d / 30d** | Binance is 24h-only → **partial** is correct; do not invent series. CoinGecko (and Paprika where available) may still return |
| Equities **7d / 30d** | Yahoo can compute multi-day change; Finnhub/Alpha Vantage free quote is 1d → may partial |
| **TVL** | Only DefiLlama live; other slots `not connected` → **partial by design** |
| **Sports** | SAMPLE-only in v1 — no live odds API |

Missing keys → `no key` / partial, not a crash.

---

## 8. Sponsor Stack in Testing

| Sponsor | Role in tests / demo |
|---------|----------------------|
| **Zetaris** | Live multi-source SQL path; contract test for request shape; SAMPLE does not require it |
| **Meterless H-MEM** | Confession/rule memory, recall, reinforce; exercised by confession + refusal tests |
| **Meterless Nightshift** | Optional prose for claims/confessions; SAMPLE uses templates; adapter contract tests retry/model fields |

Trace logs record which model handled each step (`template` | Nightshift model id | `none`) in `logs/trace.jsonl` when the app runs.

---

## 9. Results Expectations

| Check | Pass criteria |
|-------|----------------|
| `npm test` | All tests green |
| `npm run typecheck` | No errors |
| Smoke §5 steps 1–8 | Verdicts match table; no Allowed crash; 7d not blocked by 1d rule |
| Ledger | Confession/rule visible; symbol · window when metric encodes a window |
| SAMPLE sports | Full Allowed → confess → refuse without any odds API key |

There is no requirement to publish a separate “results log” file; the automated suite plus the smoke table above is the acceptance bar for this build.

---

## 10. Do Not / Honesty Rules

- Do **not** invent Binance 7d/30d (or 1h) from the 24h ticker  
- Do **not** key refusal rules on domain+symbol only — **metric (window) must isolate** confessions  
- Do **not** ship if Allowed throws when `refusal` is absent  
- Do **not** claim three live TVL sources  
- Do **not** rely on user-editable fixtures for judge demos — use **Force conflict**  
- Do **not** expect live sports odds in v1  

---

## 11. Troubleshooting

| Symptom | Likely cause / fix |
|---------|---------------------|
| Memory tests fail | Run `npm run setup` |
| Allowed crashes in UI | Hard-refresh; Allowed path must not read `r.refusal` |
| 7d refuses after 1d confession only | Bug if still present — rules must include metric |
| Live TVL always partial | Expected (DefiLlama only) |
| Live crypto 7d partial | Expected when Binance has no multi-day field |
| Port in use | Change `PORT` in `.env` or stop the other process |

---

## Version

Aligned with **main** after time windows, sports SAMPLE pack, metric-scoped rules, crypto **1h**, equities multi-day Yahoo path, and ledger symbol · window display. Re-run `npm test` after every pull.
