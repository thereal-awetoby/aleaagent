# Sample runs

Recorded with `npm run samples` in SAMPLE_MODE (fixtures, template prose, no keys).
Each file has the request (`input`) and the full result (`output`), including `trace`:
one entry per agent step with `from`, `to`, `type`, `summary` and `model`
(`template` when no language model was used, `none` for non-LLM steps; in live mode the
Nightshift model id that answered).

| File | What happens |
|---|---|
| 01-aligned-claim-allowed.json | Three crypto sources agree; the claim is allowed |
| 02-conflict-no-claim.json | Weather sources disagree; no claim is made |
| 03-write-confession.json | The confession and rule R-WX-001 are written to H-MEM |
| 04-same-pattern-refused.json | Same request again; refused, citing the confession |
| 05-threshold-claim-false-confessed.json | Aligned sources, but the claimed threshold is false; confessed |
