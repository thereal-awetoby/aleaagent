# API Reference

Base URL (default): `http://localhost:8000`  
JSON request/response unless noted. No authentication on local demo server.

## Endpoints

### `GET /api/state`

Returns current mode, domains (symbols, windows, source status, tolerances), rules, confessions, and refusal counts.

**Use:** hydrate the UI; inspect memory after runs.

---

### `POST /api/run`

Run one cycle: aggregate → rule check → claim → score (and optionally auto-confess).

**Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | e.g. `crypto`, `sports`, `weather` |
| `symbol` | string | Domain symbol, e.g. `SOL`, `EPL-F1` |
| `window` | string | optional; e.g. `1d`, `7d`, `1h`, `now` |
| `scenario` | string | `aligned` \| `conflict` (SAMPLE / force path) |
| `manual` | boolean | `true` = withhold on failure (main UI); omit/false may auto-confess |
| `tolerance` | number | optional one-off tolerance for this run |
| `threshold` | number | optional claim threshold |
| `force` | boolean | optional force outcome |

**Response (high level):** `cycle_id`, `decision` (`stands` \| `withheld` \| `refuse` \| `confess`), `bundle` (readings, status, metric, window), optional `claim`, `refusal`, `confession`, `trace`.

---

### `POST /api/confess`

Write confession + rule for a withheld cycle.

**Body:** `{ "cycle_id": "<id from /api/run>" }`

**Response:** confession, rule, updated state snapshot.

---

### `POST /api/reset`

Clear confessions and rules (Clear memory). Saved per-domain tolerances are kept.

---

### `PUT /api/constraints`

Save or clear a domain tolerance.

**Body:** `{ "domain": "crypto", "tolerance": 1.5 }` or `"tolerance": null` to restore default.

---

## Example (PowerShell)

```powershell
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/run -ContentType application/json -Body '{"domain":"crypto","symbol":"SOL","window":"1d","scenario":"conflict","manual":true}'
$r.decision
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/confess -ContentType application/json -Body (@{ cycle_id = $r.cycle_id } | ConvertTo-Json)
```

## Decisions

| `decision` | Meaning |
|------------|---------|
| `stands` | Allowed — claim holds |
| `withheld` | No claim; waiting for `/api/confess` |
| `confess` | Auto-confess path wrote confession + rule |
| `refuse` | Active rule matched; citation in `refusal` |

## Notes

- Sports has no `window` in v1.  
- Live mode may return `partial` status when sources lack keys or fields — by design for some paths (see testing.md).
