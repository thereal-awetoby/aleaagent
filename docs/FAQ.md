# FAQ

## What is Alea?

An agent that compares the **same metric across three sources**, refuses to invent consensus when they conflict, and **remembers failures** as rules so the same mistake is refused next time with a citation.

## Does it trade or move money?

No. No trades, no funds, no orders.

## Why do sources sometimes show partial?

- Missing API key → `no key`  
- Unwired slot (e.g. TVL Token Terminal) → `not connected`  
- API has no field for that window (e.g. Binance on 7d) → error/partial  

Partial is preferred over inventing data.

## Why only one live TVL source?

Only DefiLlama is free/keyless for chain TVL in this design. The other two slots are reserved on purpose. SAMPLE mode still demos a full three-source loop with fixtures.

## Why sports probabilities instead of scores?

Final scores rarely conflict once published. Book-implied **home win probability** is where independent sources disagree — better for confession demos. Live odds come from The Odds API (free key) which returns multiple bookmakers in one call.

## What are time windows?

For crypto/equities/weather, the UI can select which period’s metric to compare (e.g. 1d vs 7d). Rules are keyed by **metric**, so a confession on SOL · 1d does not block SOL · 7d.

## SAMPLE_MODE vs live?

| | SAMPLE | Live |
|--|--------|------|
| Data | Fixtures | Zetaris and/or public APIs |
| Prose | Templates | Nightshift if configured |
| Keys | None required | Optional per source |

Judges can run the full loop offline with SAMPLE.

## How do I reset demos?

Use **Clear memory** in the UI (or `POST /api/reset`). That clears confessions/rules but keeps saved tolerances.

## Where are tests documented?

[testing.md](testing.md) — automated suite, manual smoke script, API checks, honesty rules.

## Can I reuse the name Alea?

Hackathon submission — ask before reusing the name outside the event (see LICENSE).
