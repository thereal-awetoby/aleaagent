# Installation

## System requirements

- **Node.js 20 or newer** (`node -v`)  
- npm (bundled with Node)  
- Git  
- Optional for live mode: Zetaris endpoint, Meterless Nightshift token, provider API keys  

OS: Windows, macOS, or Linux. Commands below use Windows `cmd` style; translate paths for bash.

## Install steps

```bat
git clone https://github.com/thereal-awetoby/aleaagent.git
cd aleaagent
npm install
npm run setup
copy .env.example .env
```

`npm run setup` vendors the Meterless H-MEM reference engine into `vendor/hmem` (gitignored). If memory tests fail later, re-run setup.

## Configure

Edit `.env`:

| Variable | Purpose |
|----------|---------|
| `SAMPLE_MODE=true` | Offline fixtures + templates (default; no keys needed) |
| `PORT` / `HOST` | Server bind (default `8000` / `127.0.0.1`) |
| `SPREAD_TOLERANCE` | Default abs tolerance (pp) for crypto/equities-style metrics |
| `METERLESS_*` | Nightshift prose (optional) |
| `ZETARIS_*` | Live SQL path (optional) |
| `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, `ETHERSCAN_API_KEY`, `OPENWEATHER_API_KEY` | Optional direct sources |

Never commit `.env`.

## Run

```bat
set SAMPLE_MODE=true
npm start
```

Open **http://localhost:8000**

```bat
npm test
npm run typecheck
```

## Verify install

1. `npm test` — all green  
2. `npm start` — UI loads  
3. Crypto · SOL · 1d · aligned · Run → **Allowed**  

More detail: [testing.md](testing.md), [USAGE.md](USAGE.md).
