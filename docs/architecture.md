# Architecture

```
POST /api/run
      |
      v
Source Aggregator   Zetaris query, public APIs, or fixtures
      |  bundle: readings, status, spread, consensus
      v
Confessor: rule check   H-MEM recall + deterministic rule match
      |-- match --> refuse, cite confession, reinforce memory
      v
Claim Agent         confidence computed, rationale via Nightshift or template
      v
Confessor: score    true only if aligned and every source above threshold
      |-- false --> confession + rule -> H-MEM + JSONL
      v
trace + response
```

Rules are matched deterministically from `data/rules.jsonl`. H-MEM provides recall, provenance and the audit ledger for the confession behind each rule. Every handoff is appended to `logs/trace.jsonl`.
