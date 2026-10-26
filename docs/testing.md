# Testing Alea Agent

Run everything from the repo folder (Command Prompt, PowerShell, or bash).

## 1. Automated

```bat
npm test
npm run typecheck
```

Expect **all tests passing** (currently 63+) and no type errors. `npm test` uses the real H-MEM engine when available — if memory tests fail, run `npm run setup` first.

Covered suites include:

- cycle / confession / refusal loop  
- constraints (per-domain tolerance)  
- domain packs (symbols, TVL honesty, forex, weather)  
- **time windows** (crypto/equities/weather) and **window isolation** (SOL 1d ≠ SOL 7d)  
- **sports** SAMPLE loop (EPL-F1 Allowed → confess → refuse)  
- judge / Nightshift / Zetaris adapter contracts  

## 2. Start and stop

```bat
set SAMPLE_MODE=true
npm start
```

Open `http://localhost:8000`. Stop with Ctrl+C.  
Server does not hot-reload — restart after server-side changes. For `public/` only, refresh the browser.  
`npm run dev` auto-restarts on save if you prefer.

Main UI: `/`  
Classic UI: `/classic.html`

## 3. Product path (SAMPLE_MODE — default)

Operator flow:

**Domain → Symbol → [Window if shown] → Run → (on conflict) Write confession → Run again → Refused**

| Control | Notes |
|---------|--------|
| Domain | crypto, equities, forex, defi, tvl, weather, sports |
| Symbol | From the domain’s list |
| Window | Shown only when the domain has more than one window (crypto, equities, weather) |
| Force conflict | Demo lever — SAMPLE uses conflict fixtures; live skews one reading |
| Write confession | Appears after **No claim** (withheld) |
| Clear memory | Footer — clears confessions/rules; keeps saved tolerances |

### 3.1 Smoke script (Clear memory between scenarios)

| # | Action | Expect |
|---|--------|--------|
| 1 | Crypto · default window (**1d**) · aligned · Run | **Allowed** — browser must **not** crash |
| 2 | Crypto · **1d** · Force conflict · Run → Write confession · Run again | Confess → **Refused** (cites confession) |
| 3 | Crypto · **7d** · Force conflict · Run | **No claim** (withhold) — must **not** refuse from step 2’s 1d rule → Write confession → Run → **Refused** |
| 4 | Equities · **30d** · Force conflict · once | Full withhold → confess path (SAMPLE) |
| 5 | Weather · **now** · aligned · Run | **Allowed** |
| 6 | Weather · **7d** · Force conflict · confess | Confession text mentions **7-day** → refuse on re-run |
| 7 | Sports · **EPL-F1** · aligned → Force conflict → confess → re-run | Allowed → withhold → refuse |
| 8 | `npm test` + typecheck | Clean |

### 3.2 Force vs natural conflict

- **Force conflict** on: always exercises the conflict fixture (SAMPLE) or skews a live reading so judges see the loop.  
- **Force conflict** off: real/fixture aligned data → Allowed when sources agree.  
- Never average conflicting sources into a single “truth.”

### 3.3 Clear memory

Use **Clear memory** between proof scenarios so a prior confession does not refuse a new symbol/window you are still demonstrating.

### 3.4 Domains checklist

| Domain | Windows | SAMPLE demo metric |
|--------|---------|-------------------|
| crypto | 1h, 1d, 7d, 30d | % change |
| equities | 1d, 7d, 30d | % change |
| weather | now, 7d | current °C / 7-day mean °C |
| forex | — | spot rate |
| defi | — | gas (gwei) |
| tvl | — | TVL USD bn (live: DefiLlama only → partial by design) |
| sports | — | home win probability (SAMPLE books only) |

## 4. API checks (PowerShell)

```powershell
# Aligned crypto 1d
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"1d","scenario":"aligned","manual":true}'

# Conflict crypto 7d
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"7d","scenario":"conflict","manual":true}'

# Sports
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"sports","symbol":"EPL-F1","scenario":"conflict","manual":true}'

Invoke-RestMethod http://localhost:8000/api/state
```

After a withheld run, confess with the returned `cycle_id`:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/confess -ContentType application/json -Body '{"cycle_id":"PASTE_CYCLE_ID"}'
```

## 5. Live mode

1. Set `SAMPLE_MODE=false` in `.env`. Restart `npm start`.  
2. Header should indicate live data path.  
3. **Crypto 1d:** three sources may all return.  
4. **Crypto 7d/30d:** Binance is 24h-only → honest **partial** is correct (do not invent series). CoinGecko/CoinPaprika may still return.  
5. **Crypto 1h:** CoinGecko when available; Binance may partial.  
6. **TVL:** only DefiLlama is live; other two slots stay `not connected` → partial by design.  
7. **Sports:** SAMPLE-only in v1 — no live odds API.  
8. Missing keys → `no key` / partial, not a crash.

### What each live source needs

- **CoinGecko** — no key for basic price/change  
- **Binance** — public 24h ticker (no key)  
- **CoinPaprika** — public tickers  
- **Yahoo** — public chart (equities; range depends on window)  
- **Finnhub / Alpha Vantage / Etherscan / OpenWeather** — keys in `.env` when used  
- **DefiLlama** — public chain TVL  

## 6. Do not

- Invent Binance 7d/30d from the 24h ticker  
- Key rules on domain+symbol only (metric/window must isolate confessions)  
- Ship if Allowed still throws in the browser  
- Claim three live TVL sources  
- Add user-editable fixtures (Force Conflict is the judge lever)  
- Expect live sports odds in v1  

## 7. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Tests fail on memory | Run `npm run setup` |
| Allowed crashes | Hard-refresh; Allowed path must not read `refusal` |
| 7d refuses after 1d confession | Rule match missing metric — should be fixed on main |
| Live TVL always partial | Expected — only DefiLlama wired |
| Live crypto 7d partial | Expected if Binance has no 7d field |
