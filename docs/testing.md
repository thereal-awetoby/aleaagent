# Testing Alea Agent

Run everything from `C:\Users\TOBY\Documents\aleaagent` in Command Prompt (or the equivalent repo path on another machine).

## 1. Automated

```bat
npm test
npm run typecheck
```

Expect 6 passing tests and no type errors. `npm test` runs against the real H-MEM engine (not a mock), so a failure here usually means `vendor/hmem` is missing — run `npm run setup` first.

## 2. Start and stop

```bat
npm start
```

Open `http://localhost:8000`. Stop with Ctrl+C. The server does not hot reload — restart after any server-side change. For front-end-only changes (`public/`), just refresh the browser. `npm run dev` restarts automatically on save if you want that while iterating.

## 3. Manual demo path (SAMPLE_MODE, the default)

| Step | Do | Expect |
|---|---|---|
| 1 | Click **Reset memory** (footer), confirm | Empty rules and confessions |
| 2 | BTC, threshold 5, Sample data **Aligned**, Run cycle | Claim stands, no confession |
| 3 | Switch Sample data to **Conflict**, Run cycle | Confessed, rule R-001, one confession appears |
| 4 | Run cycle again | Refused, citing the confession id, recalled memory listed |
| 5 | Open the confession, click **Ledger** | create / read / feedback entries from H-MEM |
| 6 | Switch to ETH, Aligned, threshold 5, Run | Confessed as `claim_false` (consensus ≈ 3.1%) |
| 7 | ETH, Aligned, threshold 6, Run | Refused under the new rule |
| 8 | ETH, Aligned, threshold 3, Run | Claim stands (rule doesn't over-block) |
| 9 | Force confession | Confessed even on a clean bundle |

## 4. API checks (PowerShell)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"symbol":"BTC","threshold":5,"scenario":"conflict"}'
Invoke-RestMethod http://localhost:8000/api/state
Invoke-RestMethod http://localhost:8000/api/trace
```

## 5. Live mode

1. Edit `.env`: `SAMPLE_MODE=false`. Restart `npm start`.
2. Header should read **LIVE**. Zetaris shows "Public APIs" if `ZETARIS_ENDPOINT` is unset. Run a cycle and check that three real readings appear in the Sources table.
3. If a source is blocked or times out, it shows as `n/a` and the bundle becomes `partial` — that's correct behavior, not a bug.
4. With `NIGHTSHIFT_BASE_URL` set, the Claim and Confession cards should say "Written via Nightshift" instead of "Template text".
5. `npm run export:readings` writes `data\readings.csv` in the shape Zetaris expects for registering as a table.

### What each live source needs

- **CoinGecko** (`src/providers/sources.ts`): `GET {COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`, no key required on the free/demo tier. If it starts returning 429s under repeated testing, that's rate-limiting, not a broken integration — a free Demo API key sent as header `x-cg-demo-api-key` raises the limit.
- **Binance**: tries `api.binance.com` first, falls back to `data-api.binance.vision` (Binance's own keyless, market-data-only mirror) on failure — this exists specifically because `api.binance.com` returns HTTP 451 in geo-blocked regions (including parts of the US). If both fail, check whether your network blocks Binance entirely.
- **CoinPaprika**: `GET https://api.coinpaprika.com/v1/tickers/{btc-bitcoin|eth-ethereum}`, reads `quotes.USD.percent_change_24h`, no key required.

These three endpoint shapes were checked against current CoinGecko, Binance and CoinPaprika documentation and match what `src/providers/sources.ts` sends — but actually calling them from your network hasn't been run end-to-end, so confirm step 2 above actually returns three real numbers before you rely on it for the demo.

- **Nightshift**: OpenAI-compatible — set `NIGHTSHIFT_BASE_URL` to the base (no trailing `/chat/completions`, the code appends that) and `NIGHTSHIFT_API_KEY`/`NIGHTSHIFT_MODEL` if Nightshift requires them. On any failure it silently falls back to template prose and logs a warning to the console — so if you expect "Written via Nightshift" and keep seeing "Template text", check the terminal output for the `[nightshift] falling back to template: ...` line, it'll say why.
- **Zetaris**: still unverified — `src/providers/zetaris.ts` is a best guess at the REST shape. Needs a real Zetaris Air instance to confirm against.

## 6. Files to inspect after a run

`data\confessions.jsonl`, `data\rules.jsonl`, `logs\trace.jsonl`, `data\hmem\` (H-MEM state and ledger).
