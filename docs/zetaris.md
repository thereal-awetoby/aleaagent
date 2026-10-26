# Zetaris setup

In live mode, Alea reads every bundle through Zetaris: one SQL query per request, over the
Zetaris REST API. Sample mode (`SAMPLE_MODE=true`) does not need Zetaris.

## 1. Run Zetaris locally

Follow the Participant Setup Guide, section 1 (Docker Desktop with 8 GB and 4 CPUs; on Windows,
run the Zetaris commands in WSL/Ubuntu). When `./verify.sh` passes, sign in at
http://localhost:3000 and create an API key for your user. Create it yourself and copy it once.

## 2. Point Alea at it

In the project's `.env` (never commit it):

```
ZETARIS_REST_URL=http://localhost:8888/api/v1.0
ZETARIS_ORG_ID=1
ZETARIS_API_KEY=<your key>
ZETARIS_TABLE=alea.alea_readings
```

The adapter (`src/providers/zetaris.ts`) follows the guide's contract:

```
POST {ZETARIS_REST_URL}/sql-editor/sqls/run
Authorization: Bearer <ZETARIS_API_KEY>
X-Org-ID: <ZETARIS_ORG_ID>
X-Request-ID: <fresh UUID>
{ "queryId": "<uuid>", "sql": "...", "source": "SqlEditor", "limit": 100 }
-> { "data": [[source, value], ...] }
```

## 3. Load the readings table

Alea expects one table or view with these columns:

```
alea_readings(source, symbol, metric, value, captured_at)
```

and runs, for example:

```sql
SELECT source, value FROM alea_readings WHERE symbol = 'BTC' AND metric = 'change_24h'
```

Make the data:

```
npm run export:readings -- --sample   # every domain from the fixtures, no network, no keys
npm run export:readings               # live public sources (keys from .env; missing keys skipped)
```

Both write `data/readings.csv`. Register it in the web UI: NDP File System → file-store →
upload readings.csv; then Home → Register Data Source → File Source & API → database name
`alea` → Create Table → File store → storage provider NDP File System, pick readings.csv,
table name `alea_readings`, header=true, inferSchema=true → Create. The table is then
`alea.alea_readings`, so set `ZETARIS_TABLE=alea.alea_readings`. To refresh, re-export and
re-upload the CSV. Metrics per domain are listed in `src/domains.ts`
(`change_24h`, `change_1d`, `spot_rate`, `gas_price`, `temperature`).
## 4. Check it

```
npm run check
```

Expect `PASS Zetaris runs SQL over its REST API` (a `SELECT 1`) and
`PASS Zetaris table alea.alea_readings` with a row count per metric. Then set `SAMPLE_MODE=false`
and run the app: the Activity log shows `zetaris  readings via SQL`, and the trace logs the SQL.

## Failure handling

A failed Zetaris query is retried once. If it still fails, Alea reads the sources directly
for that run and says so in the trace (`fallback`), rather than inventing data. A source
missing from the table shows as `not in Zetaris`, which makes the bundle `partial`.
