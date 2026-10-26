# Usage

## Quick start (SAMPLE mode)

```bat
set SAMPLE_MODE=true
npm start
```

Open http://localhost:8000

### UI flow

1. Choose **domain** (crypto, equities, forex, defi, tvl, weather, sports).  
2. Choose **symbol**.  
3. If a **window** dropdown appears (crypto / equities / weather), pick `1h`/`1d`/`7d`/`30d` or `now`/`7d`.  
4. Optionally set tolerance / threshold controls if shown.  
5. Toggle **Force conflict** when you want the conflict → confession demo.  
6. Press **Run**.  
7. On **No claim**, press **Write confession**, then **Run** again → **Refused**.  
8. Open **Ledger** for confessions, rules, and refusal counts.  
9. **Clear memory** between independent demos.

Classic UI: http://localhost:8000/classic.html

## Example scenarios

| Goal | Settings | Expect |
|------|----------|--------|
| Happy path | Crypto, SOL, 1d, Force off | Allowed |
| Full refuse loop | Same, Force on → Write confession → Run | Refused + citation |
| Window isolation | Confess on SOL 1d; then SOL 7d Force on | 7d withholds first (not refuse) |
| Sports | Domain sports, EPL-F1, Force on | SAMPLE books conflict → confess → refuse |
| Weather 7d | Weather, Lagos, 7d, Force on | Confession mentions 7-day mean |

## Configuration environments

| Mode | `.env` | Behavior |
|------|--------|----------|
| Demo / judges | `SAMPLE_MODE=true` | Fixtures + templates; full loop offline |
| Live data | `SAMPLE_MODE=false` | Zetaris and/or public APIs; partial when a source lacks data |
| Live prose | Nightshift vars set | Claim/confession text from Nightshift; numbers still from data |

## API usage (short)

See [API.md](API.md) for full reference.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"7d","scenario":"conflict","manual":true}'
```

## Demo script

See [demo-script.md](demo-script.md) for a ~3 minute judge walkthrough.
