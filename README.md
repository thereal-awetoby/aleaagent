# Alea Agent

An agent that makes claims from fragmented sources, admits when it is wrong, and refuses the same mistake next time.

Built for **Open Agent Hackathon 2026**. Tracks: Solving Fragmented Intelligence, The Agent That Can Explain Why, Reasoning Architecture.

## What it does

Alea pulls one metric (BTC or ETH 24h change) from three independent sources and labels the bundle `aligned`, `conflict` or `partial`. It then makes a threshold claim, scores it, and on failure writes a structured confession and a rule. On the next cycle the rule is checked first. If the pattern matches, Alea refuses and cites the confession by id.

No trades, no funds, no hidden orders.

## Sponsor tech at a glance

| Sponsor | Where | What it does in Alea |
|---|---|---|
| **Zetaris** | `src/providers/zetaris.ts`, `docs/zetaris.md` | In live mode every bundle is one SQL query over the Zetaris REST API (`/sql-editor/sqls/run`) against `alea_readings`. Retried once; on failure Alea says so and reads the sources directly. |
| **Meterless H-MEM** | `src/engine.ts`, `npm run setup` | Stores each confession as long-term memory; recalls and reinforces it when a rule refuses a repeat. Tested in `test/cycle.test.ts`. |
| **Meterless Nightshift** | `src/providers/nightshift.ts` | Primary AI provider (OpenAI-compatible Runtime, `meterless-app`/`meterless-scope` headers, `/v1/models` discovery). Writes the claim rationale and the confession narrative; numbers always come from the data. Retried once, template fallback. |

Every trace step records which model handled it (`model`: the Nightshift model id, `template`, or `none`). See `logs/trace.jsonl` and the recorded runs in `samples/`.

`npm run check` tests all three connections without printing any key.

## Domains

The main view (`/`) checks one metric per domain from three sources. Sample mode (`SAMPLE_MODE=true`) uses fixtures for every domain and needs no keys. The previous UI is kept at `/classic.html`.

| Domain | Symbols | Metric / windows | Sources (key in `.env`) | Conflict when spread exceeds |
|---|---|---|---|---|
| crypto | SOL, BTC, ETH, BNB, XRP, DOGE, ADA, AVAX, LINK, DOT | **1d / 7d / 30d** % change (default 1d = 24h field) | coingecko, binance, coinpaprika | `SPREAD_TOLERANCE` pp (1.0) |
| equities | AAPL, TSLA, NVDA, MSFT, SPY, QQQ, AMZN, GOOGL, META, NFLX | **1d / 7d / 30d** % change | yahoo, finnhub (`FINNHUB_API_KEY`), alphavantage (`ALPHAVANTAGE_API_KEY`) | `SPREAD_TOLERANCE` pp (1.0) |
| forex | EURUSD, GBPUSD, USDJPY, USDCNY, USDZAR, EURGBP, AUDUSD, USDCAD, USDCHF | spot rate | frankfurter, ecb, exchangerate-api (open.er-api.com) | 0.5% of midpoint |
| defi | eth-gas, polygon-gas, arbitrum-gas, base-gas, bsc-gas, optimism-gas, avalanche-gas | gas price (gwei) | eth-gas: public-rpc (publicnode `eth_gasPrice`), etherscan (`ETHERSCAN_API_KEY`), llamarpc. Other chains: three public RPC providers each, no keys | 15% of midpoint |
| tvl | eth-tvl, sol-tvl, bsc-tvl, arbitrum-tvl, base-tvl | total value locked (USD billions) | defillama (live), tokenterminal and dappradar (reserved, not connected) | 5% of midpoint |
| sports | EPL-F1, NBA-G1, EPL-F2 | home win probability % (SAMPLE only) | book-a, book-b, book-c | `SPREAD_TOLERANCE` pp (1.0) |
| weather | Lagos, London, Tokyo, New_York, Nairobi, Singapore, Dubai, Berlin, Sao_Paulo | **now** (current °C) / **7d** (7-day mean °C) | open-meteo, wttr.in, openweather (`OPENWEATHER_API_KEY`) | 2.0 °C |

A source whose key is missing shows `no key` and is never called; the bundle is then `partial`. TVL has only one free provider (DefiLlama), so live TVL runs are `partial` by design; sample mode runs the full loop. In live mode, **Force conflict** moves one real reading outside the tolerance and marks it `forced`, so the confession loop can be shown on live data.

Main-view flow: Run, then on conflict "No claim made" (`decision: "withheld"`), then **Write confession** (`POST /api/confess {cycle_id}`), then Run again: Refused, citing the confession. Every refusal is logged to `data/refusals.jsonl` and counted in the ledger. `POST /api/run` with `manual: true` gives the withheld step; without it (classic UI, legacy routes) a failed claim is confessed at once.

## Run it

```bash
npm install
npm run setup      # vendors the Meterless H-MEM engine into vendor/ (gitignored)
cp .env.example .env
npm start          # http://localhost:8000
```

Needs Node 20 or newer. Windows users can run `alea-agent.bat` from the resources folder, which does all of this.

Try the demo path in the UI: set Sample data to Conflict, run twice. First run confesses and issues R-001. Second run is refused with a citation.

## Sponsor stack

| Layer | Tool | Where it runs |
|---|---|---|
| Data | Zetaris | `src/providers/zetaris.ts`. One SQL query returns every source. See `docs/zetaris.md`. |
| Engine | Meterless H-MEM | `src/engine.ts`. Confessions are stored as H-MEM memories, rules are recalled through `hmem.query`, refusals reinforce through `hmem.feedback`, and the UI shows each memory's ledger. |
| AI provider | Nightshift | `src/providers/nightshift.ts`. OpenAI-compatible. Writes claim rationale and confession prose only. Numbers always come from the sources. |

## Modes

| `SAMPLE_MODE` | Data | Prose | Memory |
|---|---|---|---|
| `true` (default) | Fixtures: one aligned and one conflict bundle per asset | Templates | Real H-MEM (in-process, no key needed) |
| `false` | Zetaris if `ZETARIS_ENDPOINT` is set, otherwise public APIs (CoinGecko, Binance, CoinPaprika) | Nightshift if `NIGHTSHIFT_BASE_URL` is set, otherwise templates | Real H-MEM |

If `vendor/hmem` is missing the app still runs on a small fallback memory and the header says so.

**TVL live honesty:** only DefiLlama is wired keyless; Token Terminal and DappRadar are reserved (`not connected`). Live TVL runs are **partial by design** — do not claim three live TVL sources.

## Decision rules

- `aligned`: every source within `SPREAD_TOLERANCE` percentage points (default 1.0).
- `conflict`: spread above tolerance. The claim is never averaged. It fails as `source_conflict`.
- `partial`: fewer than three sources responded. Fails as `partial_data`.
- A claim stands only when the bundle is aligned and every source is above the claimed threshold. Otherwise it is false.
- `claim_false`: sources aligned but consensus did not support the threshold. Rule blocks the same symbol at or above that threshold while consensus sits below it.

## API

| Route | Purpose |
|---|---|
| `POST /api/run` (alias `/run`) | One full cycle. Body: `symbol`, `threshold`, `scenario`, `force` |
| `POST /force-claim` | Aligned sample cycle |
| `POST /force-conflict` | Conflict sample cycle |
| `POST /force-confess` | Cycle with the outcome forced to false |
| `GET /api/state` | Mode, provider status, rules, confessions |
| `GET /api/trace` | Recent agent handoffs (also in `logs/trace.jsonl`) |
| `GET /api/audit/:memoryId` | H-MEM ledger history for one memory |
| `POST /api/reset` | Clear memory, rules, confessions and trace |

## Confession schema

```json
{
  "confession_id": "c_20261024_001",
  "claim": "BTC 24h change is above +5% across sources",
  "sources": ["coingecko", "binance", "coinpaprika"],
  "source_status": "conflict",
  "confidence": 0.42,
  "outcome": "false",
  "error_type": "source_conflict",
  "rule_id": "R-001",
  "rule_text": "If source_status=conflict on BTC 24h change, refuse claim and cite c_20261024_001",
  "next_action": "refuse",
  "created_at": "2026-10-24T12:00:00Z"
}
```

Stored records add `narrative`, `memory_id`, `threshold`, `symbol` and `forced`. Rules and confessions are append only.

## Layout

```
src/agents/        aggregator, claim, confessor
src/providers/     zetaris, nightshift, public sources
src/engine.ts      Meterless H-MEM wrapper
src/orchestrator.ts  one cycle
src/server.ts      HTTP API and static UI
public/            the interface
test/              confession loop tests
docs/              architecture, demo script, Zetaris setup
```

`npm test` runs the loop against the real H-MEM engine. `npm run typecheck` runs tsc.
