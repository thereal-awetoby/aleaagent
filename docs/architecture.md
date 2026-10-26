# Architecture

## Overview

Alea is a **single orchestrator** with three agent roles and **domain packs**. Domains plug in symbols, sources, fixtures, tolerances, and optional time windows without forking the confessor.

```
User / UI / POST /api/run
        │
        ▼
┌───────────────────┐
│ Source Aggregator │  fixtures | Zetaris SQL | direct public APIs
└─────────┬─────────┘
          │ Bundle: readings, status, spread, consensus, metric, window?
          ▼
┌───────────────────┐
│ Confessor (rules) │  H-MEM recall + deterministic match
│                   │  key: domain + symbol + metric + trigger
└─────────┬─────────┘
     match│        │ no match
          ▼        ▼
       refuse   Claim Agent ──► score
          │              │
          │         stands | fail
          │              │
          │              ▼
          │         withhold (manual) or confess
          │              │
          │              ▼
          │         confession + rule → H-MEM + JSONL
          ▼
     response + trace (logs/trace.jsonl)
```

## Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| Orchestrator | `src/orchestrator.ts` | One cycle; pending confess map |
| Aggregator | `src/agents/aggregator.ts` | Fetch/classify; never average conflict |
| Claim | `src/agents/claim.ts` | Claim JSON + confidence |
| Confessor | `src/agents/confessor.ts` | Rules, score, confession, rule emit |
| Judge | `src/agents/judge.ts` | Optional prose number checks |
| Domains | `src/domains.ts` | Registry, windows, tolerances |
| Sources | `src/providers/sources.ts` | Direct HTTP fetchers (window-aware) |
| Zetaris | `src/providers/zetaris.ts` | Live SQL bundle path |
| Nightshift | `src/providers/nightshift.ts` | Optional LLM prose |
| Memory | `src/memory/*`, `src/engine.ts` | Rules, confessions, H-MEM |
| UI | `public/alea.js` | Main demo UI |

## Data flow decisions

| Bundle status | Typical decision |
|---------------|------------------|
| aligned | Claim may stand if threshold logic passes |
| conflict | No averaged truth → withhold/confess |
| partial | Fail closed / low confidence path |

Rules match **domain + symbol + metric** (metric encodes window where applicable).

## Persistence

- Rules / confessions: JSONL under data dir + H-MEM when available  
- Constraints (tolerances): `constraints.json`  
- Trace: `logs/trace.jsonl`  

## Related docs

- [testing.md](testing.md) — how to verify  
- [API.md](API.md) — HTTP surface  
- [zetaris.md](zetaris.md) — Zetaris setup  
- [demo-script.md](demo-script.md) — live narrative  
