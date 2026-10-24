# Zetaris setup

Alea expects one queryable table or view:

```
alea_readings(source, symbol, metric, value)
```

with one row per source, for example `coingecko, BTC, change_24h, 5.42`. Alea runs:

```sql
SELECT source, value FROM alea_readings WHERE symbol = 'BTC' AND metric = 'change_24h'
```

## Getting data in

`npm run export:readings` fetches the live public sources and writes `data/readings.csv` in exactly this shape. Register that file as a table in Zetaris Air (File System, then register the file), or register the three sources separately and expose them through one view.

## Pointing Alea at it

Set in `.env`:

```
SAMPLE_MODE=false
ZETARIS_ENDPOINT=<your Zetaris REST SQL URL>
ZETARIS_API_KEY=<token, if required>
ZETARIS_SQL_FIELD=sql
```

The adapter in `src/providers/zetaris.ts` POSTs `{ "<ZETARIS_SQL_FIELD>": "<sql>" }` as JSON with an optional bearer token, and accepts a response that is a row array, or an object with `rows`, `data` or `results`. Rows can be objects (`source`, `value`) or arrays. Zetaris REST access is documented in its knowledge base under Connecting to Zetaris, Access via REST API. If your instance expects a different request shape, `queryReadings` is the only function to change.
