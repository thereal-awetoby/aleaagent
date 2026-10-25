import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.ts";
import { getEngine, resetEngine } from "./engine.ts";
import { canonicalSymbol, describeDomains, domainOfSymbol, isDomain, type DomainId } from "./domains.ts";
import { confessions, refusals, rules } from "./memory/store.ts";
import { clearPending, confessPending, currentMode, runCycle } from "./orchestrator.ts";
import { clearTrace, recentTrace } from "./trace.ts";
import type { Scenario } from "./types.ts";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 65536) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) : {};
}

function parseRun(body: any, overrides: { scenario?: Scenario; force?: boolean } = {}) {
  const rawSymbol = String(body.symbol ?? "BTC").trim();
  const rawDomain = body.domain === undefined || body.domain === "" ? domainOfSymbol(rawSymbol) : String(body.domain);
  if (!rawDomain || !isDomain(rawDomain)) throw new Error("unknown domain");
  const domain = rawDomain as DomainId;
  const symbol = canonicalSymbol(domain, rawSymbol);
  if (!symbol) throw new Error(`symbol is not listed for ${domain}`);
  let threshold: number | null = null;
  if (body.threshold !== undefined && body.threshold !== null && body.threshold !== "") {
    threshold = Number(body.threshold);
    if (!Number.isFinite(threshold) || Math.abs(threshold) > 1e7) throw new Error("threshold must be a number");
  }
  const scenario: Scenario = overrides.scenario ?? (body.scenario === "conflict" ? "conflict" : "aligned");
  return {
    domain,
    symbol,
    threshold,
    scenario,
    forceOutcome: overrides.force ?? body.force === true,
    autoConfess: body.manual === true ? false : true,
  };
}

async function state() {
  const engine = await getEngine();
  const mode = await currentMode();
  return {
    mode,
    tolerance: config.tolerance,
    providers: {
      zetaris: mode.data === "zetaris" ? "live" : mode.data === "direct" ? "direct" : "sample",
      meterless: engine.source === "vendor/hmem" ? "live" : "fallback",
      nightshift: mode.llm === "nightshift" ? "live" : "template",
    },
    domains: describeDomains(mode.sample),
    rules: rules.all().reverse(),
    confessions: confessions.all().reverse(),
    refusals: refusals.counts(),
    refusal_total: refusals.all().length,
  };
}

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && p === "/api/state") return send(res, 200, await state()), true;
  if (method === "GET" && p === "/api/trace") return send(res, 200, recentTrace(60)), true;
  if (method === "GET" && p.startsWith("/api/audit/")) {
    const engine = await getEngine();
    return send(res, 200, engine.history(decodeURIComponent(p.slice("/api/audit/".length)))), true;
  }
  if (method === "POST" && p === "/api/reset") {
    await resetEngine();
    clearTrace();
    clearPending();
    return send(res, 200, await state()), true;
  }
  if (method === "POST" && p === "/api/confess") {
    const body = await readJson(req);
    const out = await confessPending(String(body.cycle_id ?? ""));
    return send(res, 200, { ...out, state: await state() }), true;
  }
  const runs: Record<string, { scenario?: Scenario; force?: boolean }> = {
    "/api/run": {},
    "/run": {},
    "/force-claim": { scenario: "aligned", force: false },
    "/force-conflict": { scenario: "conflict", force: false },
    "/force-confess": { force: true },
  };
  if (method === "POST" && p in runs) {
    const result = await runCycle(parseRun(await readJson(req), runs[p]));
    return send(res, 200, result), true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (await api(req, res, url)) return;
    if (req.method !== "GET") return send(res, 404, { error: "not found" });
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "not found" });
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? "application/octet-stream");
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
});

const mode = await currentMode();
server.listen(config.port, config.host, () => {
  console.log(`\n  Alea Agent  http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  console.log(`  mode: ${mode.sample ? "SAMPLE_MODE" : "live"} | data: ${mode.data} | prose: ${mode.llm} | memory: ${mode.memory}\n`);
  if (mode.memory === "fallback") console.log("  H-MEM engine not found. Run: npm run setup\n");
});
