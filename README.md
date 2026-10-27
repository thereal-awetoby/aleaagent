# Alea Agent

An agent that makes claims from fragmented sources, admits when it is wrong, and refuses the same mistake next time.

**Demo video:** https://youtu.be/Xcku_nJ09V0
**Team Bob_d_Builder:** Tobiloba Awe, Sruthy Rajesh Bindhu

Built for **Open Agent Hackathon 2026**. Primary track: **Reasoning Architecture**.

## What it does

Alea reads the same fact from three independent sources (for example, London's current temperature from open-meteo, wttr.in and openweather) and decides, in code, whether a claim can be made:

- **Allowed**: the sources agree within the domain's tolerance, so the claim stands.
- **No claim made**: the sources disagree. Alea does not average them into a number no source reported.
- **Refused**: the same pattern has failed before. Alea refuses and cites its own earlier confession by id.

After a failure, Alea writes a plain-English **confession** and a **rule**, stores both in memory, and checks that rule first on every later run. Eight domains are supported: crypto, equities, forex, gas (defi), TVL, weather, sports and news.

No trades, no funds, no hidden orders.

### Architecture: an orchestrated multi-agent pipeline

| Agent | File | Job |
|---|---|---|
| Aggregator | `src/agents/aggregator.ts` | Reads one metric from three sources (via Zetaris in live mode) |
| Claim | `src/agents/claim.ts` | Compares the spread to the tolerance; Allowed or No claim made; explains why |
| Confessor | `src/agents/confessor.ts` | Writes the confession and rule into H-MEM; triggers Refused when a rule matches |
| Judge | `src/agents/judge.ts` | Checks every written draft: code checks first (numbers must match the data, rule id last, no leaked reasoning), then a Nemotron review. One rewrite, then a safe template |

An orchestrator (`src/orchestrator.ts`) passes work between the agents and records every handoff in the trace (shown in the UI's Activity log). Verdicts are always decided by code; the language model only writes and reviews the explanations, so the same evidence always gives the same verdict.

## Sponsor tech at a glance

| Sponsor | Where | What it does in Alea |
|---|---|---|
| **Zetaris** | `src/providers/zetaris.ts`, `docs/zetaris.md` | In live mode every bundle is one SQL query over the Zetaris REST API (`/sql-editor/sqls/run`) against `alea_readings`. Retried once; on failure Alea says so and reads the sources directly. |
| **Meterless H-MEM** | `src/engine.ts`, `npm run setup` | Stores each confession as long-term memory; recalls and reinforces it when a rule refuses a repeat. Tested in `test/cycle.test.ts`. |
| **Meterless Nightshift** | `src/providers/nightshift.ts` | Primary AI provider (OpenAI-compatible Runtime, `meterless-app`/`meterless-scope` headers, `/v1/models` discovery). Writes the claim rationale and the confession narrative; numbers always come from the data. Retried once, template fallback. |
| **NVIDIA Nemotron** | `src/providers/nightshift.ts`, `src/agents/judge.ts` | `nvidia/nemotron-3.5-lightning-30b-a3b`, routed through Nightshift. Writes the claim rationale and confession, and reviews every draft as the Judge. Thinking is off for speed (`enable_thinking: false`); an optional deeper judge mode is behind `METERLESS_JUDGE_THINKING` (off by default). |
| **Cursor** | whole repo | Development environment. See *How we used Cursor* below. |

Every trace step records which model handled it (`model`: the Nightshift model id, `template`, or `none`). See `logs/trace.jsonl` and the recorded runs in `samples/`.

`npm run check` tests all three connections without printing any key.

## How we used Cursor

We used Cursor's agent to debug and harden Alea's live integration with Nemotron:

- **Diagnosis.** Cursor traced every Nightshift call to one client (`src/providers/nightshift.ts`) and added error-body logging, which showed that intermittent HTTP 502s were really `nemotron-3.5-lightning-30b-a3b_empty_response`: the model spent its token budget on reasoning and returned no text.
- **Fix.** It disabled thinking for writer calls (`chat_template_kwargs: { enable_thinking: false }`), raised `max_tokens` to 4000, and added an optional judge-only thinking flag with tests.
- **Demo fixes.** It kept judge verdicts visible across steps in the Activity log, added the sponsor footer, and added a judge code check so percentage-of-midpoint gaps are never described as "percentage points".
- **Safety.** A `.cursorignore` keeps `.env` out of the AI context; every change was made on a branch with `npm test` passing (78/78).


## Domains

The main view (`/`) checks one metric per domain from three sources. Sample mode (`SAMPLE_MODE=true`) uses fixtures for every domain and needs no keys. The previous UI is kept at `/classic.html`.

| Domain | Symbols | Metric / windows | Sources (key in `.env`) | Conflict when spread exceeds |
|---|---|---|---|---|
| crypto | SOL, BTC, ETH, BNB, XRP, DOGE, ADA, AVAX, LINK, DOT | **1d / 7d / 30d** % change (default 1d = 24h field) | coingecko, binance, coinpaprika | `SPREAD_TOLERANCE` pp (1.0) |
| equities | AAPL, TSLA, NVDA, MSFT, SPY, QQQ, AMZN, GOOGL, META, NFLX | **1d / 7d / 30d** % change | yahoo, finnhub (`FINNHUB_API_KEY`), alphavantage (`ALPHAVANTAGE_API_KEY`) | `SPREAD_TOLERANCE` pp (1.0) |
| forex | EURUSD, GBPUSD, USDJPY, USDCNY, USDZAR, EURGBP, AUDUSD, USDCAD, USDCHF | spot rate | frankfurter, ecb, exchangerate-api (open.er-api.com) | 0.5% of midpoint |
| defi | eth-gas, polygon-gas, arbitrum-gas, base-gas, bsc-gas, optimism-gas, avalanche-gas | gas price (gwei) | eth-gas: public-rpc (publicnode `eth_gasPrice`), etherscan (`ETHERSCAN_API_KEY`), llamarpc. Other chains: three public RPC providers each, no keys | 15% of midpoint |
| tvl | eth-tvl, sol-tvl, bsc-tvl, arbitrum-tvl, base-tvl | total value locked (USD billions) | defillama (live), tokenterminal and dappradar (reserved, not connected) | 5% of midpoint |
| news | event-fed-rate, event-halving, event-election, event-etf, event-upgrade | headline status: confirmed / unconfirmed / denied (SAMPLE only) | wire-a, wire-b, wire-c (not connected in live mode) | any two sources give a different status |
| sports | EPL-F1, NBA-G1, EPL-F2 | home win probability % | draftkings, fanduel, betmgm (The Odds API) | `SPREAD_TOLERANCE` pp (1.0) |
| weather | Lagos, London, Tokyo, New_York, Nairobi, Singapore, Dubai, Berlin, Sao_Paulo | **now** (current °C) / **7d** (7-day mean °C) | open-meteo, wttr.in, openweather (`OPENWEATHER_API_KEY`) | 2.0 °C |

A source whose key is missing shows `no key` and is never called; the bundle is then `partial`. TVL has only one free provider (DefiLlama), so live TVL runs are `partial` by design; sample mode runs the full loop. News has no live sources yet: it runs the full loop in sample mode only, and in live mode its sources show `not connected`. In live mode, **Force conflict** moves one real reading outside the tolerance and marks it `forced`, so the confession loop can be shown on live data.

Main-view flow: Run, then on conflict "No claim made" (`decision: "withheld"`), then **Write confession** (`POST /api/confess {cycle_id}`), then Run again: Refused, citing the confession. Every refusal is logged to `data/refusals.jsonl` and counted in the ledger. `POST /api/run` with `manual: true` gives the withheld step; without it (classic UI, legacy routes) a failed claim is confessed at once.

## Run it

```bash
npm install
npm run setup      # vendors the Meterless H-MEM engine into vendor/ (gitignored)
cp .env.example .env
npm start          # http://localhost:8000
```

Needs Node 20 or newer. Windows users can run `alea-agent.bat` from the resources folder, which does all of this.

Try the demo path in the UI: pick weather → London, turn **Force conflict** on, then **Run** (No claim made) → **Write confession** → **Run** again (Refused, citing the confession).

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

**TVL:** DefiLlama is the live keyless source. Token Terminal and DappRadar slots are reserved (`not connected`). Live TVL runs are partial by design.

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
src/agents/        aggregator, claim, confessor, judge
src/providers/     zetaris, nightshift, public sources
src/engine.ts      Meterless H-MEM wrapper
src/orchestrator.ts  one cycle
src/server.ts      HTTP API and static UI
public/            the interface
test/              confession loop tests
docs/              architecture, demo script, Zetaris setup
```

`npm test` runs the loop against the real H-MEM engine (78 tests, including the H-MEM confession loop in `test/cycle.test.ts`). `npm run typecheck` runs tsc.

## Examples

`samples/` holds five recorded runs (input and full output JSON): an aligned claim that is allowed, a conflict with no claim, writing the confession, the same pattern refused with a citation, and a false threshold claim that is confessed. `samples/live/` holds a live `npm run check` output and a screenshot of the live London loop with Nemotron. Each run is also callable: `POST /api/run` takes JSON and returns JSON, and the trace is written to `logs/trace.jsonl`.

## AI and model usage

**Models (through Meterless Nightshift):** `nvidia/nemotron-3.5-lightning-30b-a3b` writes the claim rationale and the confession, and reviews every draft as the Judge. The model that handled each step is recorded in the trace (`model` field) and shown in the UI's Activity log; `template` means the safe fallback was used.

**Sponsor technology:** Zetaris is the data layer (one SQL query per bundle over its REST API). Meterless H-MEM stores confessions and recalls the rules that drive refusals (tested in `test/cycle.test.ts`). Meterless Nightshift is the only AI provider. NVIDIA Nemotron powers all generated text and the model review step.

**Development tools:** built with Cursor and Claude Code. AI-assisted coding was used for scaffolding, debugging, tests and documentation. All generated code was reviewed and tested by the team.

**Sample mode:** `SAMPLE_MODE=true` runs the full agent logic on cached fixtures with no calls to Zetaris, Nightshift or any network service, and with no keys.

## Limitations

- The agents run in a fixed order set by the orchestrator; they do not negotiate or plan freely.
- Live news sources are not connected (news runs in sample mode only), and live TVL has one free provider, so TVL runs are `partial` by design.
- Zetaris reads a CSV export of the live readings (`npm run export:readings`); readings are as fresh as the last export, not streamed.
- **Force conflict** is a demo control that moves one real reading out of range so the confession loop can be shown on demand.
- NVIDIA's free endpoint is rate-limited and can be slow; Alea retries once, then uses a checked template, so verdicts are never affected.
