// Alea main view. Toby's design (markup, styles and copy from the design export), wired to the API:
// GET /api/state, POST /api/run (manual: true), POST /api/confess, POST /api/reset.
// No dependencies. Every value shown comes from the server.

const app = document.getElementById("app");

// ---------- state ----------

const ui = {
  ready: false,
  error: "",
  server: null, // /api/state
  view: "run",
  domain: "crypto",
  symbol: "",
  armed: false,
  phase: "idle", // idle | running | done
  step: 0,
  run: null, // last /api/run result
  result: null, // allowed | withheld | refused
  writing: false,
  justConfessed: null, // { confession, rule } just written
  lfilter: "all",
  sel: null,
  log: [],
};

// ---------- helpers ----------

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = () => new Date().toTimeString().slice(0, 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, method) {
  const res = await fetch(path, body === undefined ? {} : { method: method || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

function fmtVal(unit, v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  if (unit === "pct") return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  if (unit === "c") return v.toFixed(1) + " °C";
  if (unit === "usdb") return "$" + v.toFixed(2) + "B";
  if (unit === "gwei") return v.toFixed(v < 0.1 ? 4 : v < 10 ? 2 : 1) + " gwei";
  return v.toFixed(v >= 20 ? 3 : 4);
}

function fmtSpread(D, spread, mid) {
  if (spread === null || spread === undefined) return "—";
  if (D.tol_kind === "rel") return ((spread / Math.abs(mid || 1)) * 100).toFixed(2) + "%";
  if (D.unit === "pct") return spread.toFixed(2) + " pp";
  if (D.unit === "c") return spread.toFixed(1) + " °C";
  return spread.toFixed(4);
}

const domainSpec = () => ui.server.domains.find((d) => d.id === ui.domain) || ui.server.domains[0];

/** Sources read for a symbol: its own list when the domain gives it one (e.g. other chains' gas). */
const sourcesOf = (D, symbol) => (D.symbol_sources && D.symbol_sources[symbol]) || D.sources;

function addLog(who, text) {
  ui.log = ui.log.concat([{ time: clock(), who, text }]).slice(-9);
}

function resetView(extra = {}) {
  Object.assign(ui, { phase: "idle", step: 0, run: null, result: null, writing: false, justConfessed: null }, extra);
}

/** Ledger entries: confessions joined with their rule and refusal count, newest first. */
function entries() {
  const s = ui.server;
  return s.confessions.map((c) => {
    const rule = s.rules.find((r) => r.rule_id === c.rule_id);
    return {
      id: c.confession_id,
      rule: c.rule_id,
      domain: c.domain || "crypto",
      symbol: c.symbol,
      claim: c.claim,
      sources: (c.sources || []).join(", "),
      status: c.source_status,
      confidence: Number(c.confidence).toFixed(2),
      outcome: c.outcome,
      next: c.next_action,
      error_type: c.error_type,
      date: String(c.created_at || "").slice(0, 10),
      refusals: (s.refusals && s.refusals[c.confession_id]) || 0,
      text: rule ? rule.rule_text : c.rule_text,
    };
  });
}

/** The rule (and its confession) currently in force for the selected domain/symbol, if any. */
function memFor(list) {
  return list.find((e) => e.domain === ui.domain && e.symbol === ui.symbol) || null;
}

// ---------- actions ----------

async function refreshState() {
  ui.server = await api("/api/state");
}

function pickDomain(id) {
  if (busy()) return;
  const D = ui.server.domains.find((d) => d.id === id);
  if (!D) return;
  resetView({ domain: id, symbol: D.symbols[0] });
  addLog("alea", "domain set to " + id);
  render();
}

const busy = () => ui.phase === "running" || ui.writing;

async function doRun() {
  if (busy()) return;
  const D = domainSpec();
  const key = ui.domain + "/" + ui.symbol;
  const armed = ui.armed;
  resetView({ phase: "running", step: 0 });
  addLog("aggregator", "reading " + key + (armed ? (ui.server.mode.sample ? " (conflict fixture)" : " (force conflict)") : ""));
  render();

  let r;
  try {
    [r] = await Promise.all([
      api("/api/run", { domain: ui.domain, symbol: ui.symbol, scenario: armed ? "conflict" : "aligned", manual: true }),
      wait(520),
    ]);
  } catch (err) {
    resetView();
    addLog("alea", "error: " + err.message);
    render();
    return;
  }
  ui.run = r;
  for (let i = 0; i < sourcesOf(D, ui.symbol).length; i++) {
    ui.step = i + 1;
    const rd = r.bundle.readings[i];
    if (rd) addLog("aggregator", rd.source + " " + (rd.value === null ? rd.error || "no value" : rd.forced ? "ok (forced)" : "ok"));
    render();
    await wait(520);
  }

  const b = r.bundle;
  ui.phase = "done";
  ui.step = 3;
  ui.result = r.decision === "stands" ? "allowed" : r.decision === "refuse" ? "refused" : "withheld";
  if (b.via === "zetaris") addLog("zetaris", "readings via SQL");
  (b.retries || []).forEach((s) => addLog("aggregator", s + " retried once"));
  if (b.fallback) addLog("aggregator", "zetaris down, read sources directly");
  addLog("aggregator", "status " + b.status);
  const by = r.claim && r.claim.model && r.claim.model !== "template" ? " · " + r.claim.model : "";
  if (ui.result === "allowed") addLog("claim", "allowed, confidence " + r.claim.confidence + by);
  else if (ui.result === "withheld") {
    const n = b.readings.filter((x) => x.value !== null).length;
    addLog("claim", r.error_type === "source_conflict" ? "none, conflict is not averaged" : r.error_type === "partial_data" ? "none, only " + n + " of " + b.readings.length + " sources" : "none, claim did not hold");
  } else {
    addLog("confessor", "rule " + r.refusal.rule.rule_id + " matches");
    addLog("refused", "cites " + r.refusal.rule.confession_id);
  }
  await refreshState().catch(() => {});
  render();
}

async function doConfess() {
  if (cannotConfess()) return;
  ui.writing = true;
  addLog("confessor", "writing confession for " + ui.domain + "/" + ui.symbol);
  render();
  try {
    const out = await api("/api/confess", { cycle_id: ui.run.cycle_id });
    ui.server = out.state;
    ui.justConfessed = { confession: out.confession, rule: out.rule };
    const m = out.confession.narrative_model;
    addLog("confessor", "rule written, memory updated" + (m && m !== "template" ? " · " + m : ""));
  } catch (err) {
    addLog("confessor", "error: " + err.message);
  }
  ui.writing = false;
  render();
}

async function doReset() {
  if (busy()) return;
  try {
    ui.server = await api("/api/reset", {});
    resetView({ sel: null, lfilter: "all" });
    addLog("alea", "memory cleared");
  } catch (err) {
    addLog("alea", "error: " + err.message);
  }
  render();
}

/** Save the user's tolerance for the selected domain. An empty value restores the default. */
async function doSetTol(raw) {
  if (busy()) return;
  const D = domainSpec();
  const text = String(raw).trim();
  let native = null;
  if (text !== "") {
    const n = Number(text);
    if (!Number.isFinite(n)) {
      addLog("alea", "tolerance must be a number");
      return render();
    }
    native = +(n / D.tol_scale).toPrecision(12);
  }
  try {
    ui.server = await api("/api/constraints", { domain: ui.domain, tolerance: native }, "PUT");
    resetView();
    addLog("alea", native === null ? "tolerance back to default" : "tolerance set to " + text + " " + D.tol_label + " for " + ui.domain);
  } catch (err) {
    addLog("alea", "error: " + err.message);
  }
  render();
}

function cannotConfess() {
  return !(ui.phase === "done" && ui.result === "withheld" && !ui.justConfessed && ui.run) || ui.writing;
}

// ---------- view ----------

const MONO = "font-family: 'IBM Plex Mono', monospace;";
const KICK = MONO + " font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;";
const PANEL_HEAD = "padding: 12px 20px; border-bottom: 1px solid #161616; " + KICK + " font-weight: 600";
const LABEL = "display: flex; flex-direction: column; gap: 6px; " + KICK + " color: #3F3C37";
const SELECT = "height: 44px; border: 1px solid #161616; border-radius: 0; background: #FFFFFF; color: #161616; font-family: 'IBM Plex Mono', monospace; font-size: 15px; padding: 0 12px";
const BTN_BASE = "height: 44px; border: 1px solid #161616; border-radius: 0; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; ";
const ROW_BASE = "width: 100%; display: flex; justify-content: space-between; align-items: center; height: 44px; padding: 0 20px; border: 0; border-bottom: 1px solid #C9C6BC; border-radius: 0; font-size: 14px; text-align: left; ";
const LROW_BASE = "width: 100%; display: grid; grid-template-columns: 1.4fr 0.8fr 0.7fr 1.1fr 0.8fr 1.1fr; gap: 16px; padding: 14px 20px; border: 0; border-bottom: 1px solid #C9C6BC; border-radius: 0; font-size: 14px; text-align: left; ";
const CHIP_BASE = "height: 36px; padding: 0 16px; border: 1px solid #161616; border-radius: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; ";
const NAV_BASE = "background: transparent; border: 0; border-radius: 0; padding: 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #161616; ";
const NAV_ON = "text-decoration: underline; text-underline-offset: 8px; text-decoration-thickness: 2px; font-weight: 600";
const DIS = (on) => (on ? " disabled" : "");

function verdictBlock(v) {
  const r = ui.run;
  const b = r && r.bundle;
  if (ui.phase === "idle")
    return `<div style="background: #FFFFFF; padding: 28px 20px; border-bottom: 1px solid #161616"><div style="${KICK}">Waiting</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">Ready</div><div style="font-size: 17px; margin-top: 6px">Press Run to read the sources.</div></div>`;
  if (ui.phase === "running")
    return `<div style="background: #FFFFFF; padding: 28px 20px; border-bottom: 1px solid #161616"><div style="${KICK}">Working</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">Reading sources</div><div style="margin-top: 14px; height: 10px; border: 1px solid #161616; background: #FFFFFF"><div style="height: 100%; background: #161616; width: ${Math.round(((ui.step + 0.5) / 3) * 100)}%; transition: width 380ms linear"></div></div></div>`;
  if (ui.result === "allowed")
    return `<div style="background: #161616; color: #FFFFFF; padding: 28px 20px"><div style="${KICK}">Verdict</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">Allowed</div><div style="font-size: 17px; margin-top: 6px">${esc(r.claim.text)}. Confidence ${esc(r.claim.confidence)}.</div></div>`;
  if (ui.result === "withheld" && !ui.justConfessed) {
    const n = b.readings.filter((x) => x.value !== null).length;
    const why =
      r.error_type === "partial_data"
        ? `Only ${n} of ${b.readings.length} sources answered. Alea will not claim on partial data. Write a confession so it refuses next time.`
        : r.error_type === "claim_false"
          ? "The claim did not hold across sources. Write a confession so it refuses next time."
          : "The sources disagree. Alea will not pick a winner or average them. Write a confession so it refuses next time.";
    return `<div style="background: #FFFFFF; color: #161616; padding: 28px 20px; border-bottom: 1px solid #161616"><div style="${KICK}">Verdict</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">No claim made</div><div style="font-size: 17px; margin-top: 6px">${esc(why)}</div></div>`;
  }
  if (ui.result === "withheld" && ui.justConfessed)
    return `<div style="background: #FFFFFF; color: #161616; padding: 28px 20px; border-bottom: 1px solid #161616"><div style="${KICK}">Memory</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">Confession saved</div><div style="font-size: 17px; margin-top: 6px">The rule is now in force. Press Run again to see Alea refuse.</div></div>`;
  if (ui.result === "refused")
    return `<div style="background: #9A2B1F; color: #FFFFFF; padding: 28px 20px"><div style="${KICK}">Verdict</div><div style="font-size: 40px; font-weight: 700; line-height: 1.15">Refused</div><div style="font-size: 17px; margin-top: 6px">Rule ${esc(r.refusal.rule.rule_id)} applies. This request matches confession ${esc(r.refusal.rule.confession_id)}, so no new claim is made.</div></div>`;
  return "";
}

function sourcesBlock(D) {
  const r = ui.run;
  const done = ui.phase === "done";
  const readings = r ? r.bundle.readings : [];
  const rows = sourcesOf(D, ui.symbol).map((src, i) => {
    const rd = readings[i];
    const shown = !!rd && (done || (ui.phase === "running" && i < ui.step));
    const name = rd ? rd.source : src.id;
    const value = shown ? (rd.value === null ? "n/a" : fmtVal(D.unit, rd.value)) : "—";
    let read = "—";
    if (shown) read = rd.value === null ? rd.error || "no value" : rd.forced ? "forced" : "ok";
    else if (ui.phase === "running" && i === ui.step) read = "reading";
    else if (ui.phase === "idle" && (src.status === "no key" || src.status === "not connected")) read = src.status;
    return `<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 12px 16px; border-bottom: 1px solid #C9C6BC"><span>${esc(name)}</span><span>${esc(value)}</span><span>${esc(read)}</span></div>`;
  });
  const b = r && r.bundle;
  const spread = done && b ? fmtSpread(D, b.spread, b.consensus) : "—";
  const statusLabel = done && b ? b.status : "—";
  const statusCell = statusLabel === "partial" ? `<span style="color: #9A2B1F; font-weight: 700">PARTIAL</span>` : esc(statusLabel);

  // Partial is never silent: after a run it says how many sources answered and why the rest did not;
  // before a run (live mode) it warns which sources have no API key.
  let notice = "";
  const ruled = sourcesOf(D, ui.symbol);
  if (done && b && b.status === "partial") {
    const missing = b.readings.filter((x) => x.value === null).map((x) => x.source + " (" + (x.error || "no value") + ")");
    const got = b.readings.length - missing.length;
    notice = `<div role="status" style="margin-bottom: 16px; padding: 12px 16px; border: 2px solid #9A2B1F; background: #FFFFFF; color: #9A2B1F; font-size: 15px"><div style="${KICK} font-weight: 600">Partial</div>Only ${got} of ${b.readings.length} sources returned a value, so Alea cannot cross-check this claim. Missing: ${esc(missing.join(", "))}.</div>`;
  } else if (!done && ui.phase !== "running") {
    const noKey = ruled.filter((s) => s.status === "no key").map((s) => s.id);
    const unwired = ruled.filter((s) => s.status === "not connected").map((s) => s.id);
    const why = [];
    if (noKey.length) why.push(`${noKey.length} need an API key that is not set (${noKey.join(", ")})`);
    if (unwired.length) why.push(`${unwired.length} are not connected yet (${unwired.join(", ")})`);
    if (why.length)
      notice = `<div role="status" style="margin-bottom: 16px; padding: 12px 16px; border: 1px solid #161616; background: #FFFFFF; font-size: 15px"><div style="${KICK} font-weight: 600">Partial expected</div>Of ${ruled.length} sources for this symbol, ${esc(why.join(" and "))}. Live runs will be partial until that is fixed.</div>`;
  }

  let bar = "";
  const vals = done && b ? b.readings.filter((x) => x.value !== null).map((x) => x.value) : [];
  if (vals.length) {
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const mid = (mn + mx) / 2;
    const tolAbs = b.tolerance_kind === "rel" ? b.tolerance * Math.abs(mid) : b.tolerance;
    const lo = mn - tolAbs * 0.6;
    const hi = Math.max(mn + tolAbs, mx) + tolAbs * 0.6;
    const span = hi - lo || 1;
    const zone = `position: absolute; top: 0; bottom: 0; background: #DDDAD0; left: ${((mn - lo) / span) * 100}%; width: ${(tolAbs / span) * 100}%`;
    const ticks = vals
      .map((v) => `<div style="position: absolute; top: 6px; bottom: 6px; width: 4px; left: calc(${((v - lo) / span) * 100}% - 2px); background: ${v > mn + tolAbs + 1e-9 ? "#9A2B1F" : "#161616"}"></div>`)
      .join("");
    bar = `<div style="margin-top: 20px"><div style="position: relative; height: 44px; border: 1px solid #161616; background: #FFFFFF"><div style="${zone}"></div>${ticks}</div><div style="margin-top: 8px; font-size: 14px; color: #3F3C37">Each mark is one source. The grey block is the agreement zone; a red mark falls outside it.</div></div>`;
  }

  return `<div style="padding: 24px 20px 8px; ${KICK} font-weight: 600">Sources</div>
<div style="padding: 0 20px 20px">
${notice}
<div style="overflow-x: auto">
<div style="min-width: 440px; ${MONO} font-size: 14px; border: 1px solid #161616; background: #FFFFFF">
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 16px; border-bottom: 1px solid #161616; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #3F3C37"><span>Source</span><span>${esc(D.label)}</span><span>Read</span></div>
${rows.join("")}
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 12px 16px; font-weight: 600"><span>Spread</span><span>${esc(spread)}</span><span>${statusCell}</span></div>
</div>
</div>
${bar}
<div style="margin-top: 12px; font-size: 14px; color: #3F3C37">${esc(D.tol_text)}${D.tol_custom ? " This is your own tolerance." : ""}${b && b.forced_conflict ? " Force conflict moved one live reading outside the zone for this run." : ""}</div>
</div>`;
}

function confessionPanel(list) {
  let c = null;
  let rule = null;
  if (ui.justConfessed) {
    c = ui.justConfessed.confession;
    rule = ui.justConfessed.rule;
  } else if (ui.phase === "done" && ui.result === "refused") {
    rule = ui.run.refusal.rule;
    c = ui.run.refusal.confession || ui.server.confessions.find((x) => x.confession_id === rule.confession_id) || null;
  }
  if (!rule) return "";
  const id = rule.confession_id;
  const et = c ? c.error_type : "source_conflict";
  const before =
    et === "partial_data" ? "Only some sources answered and no rule existed." : et === "claim_false" ? "The claim did not hold and no rule existed." : "Sources conflicted and no rule existed.";
  return `<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="${PANEL_HEAD}">${ui.justConfessed ? "Confession written" : "Cited confession"}</div>
<div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #161616">
<div style="flex: 1 1 240px; padding: 16px 20px; background: #FFFFFF; border-right: 1px solid #161616">
<div style="${KICK} color: #3F3C37">Before the confession</div>
<div style="font-size: 22px; font-weight: 700">No claim made</div>
<div style="font-size: 15px; color: #3F3C37">${esc(before)}</div>
</div>
<div style="flex: 1 1 240px; padding: 16px 20px; background: #9A2B1F; color: #FFFFFF">
<div style="${KICK}">After the confession</div>
<div style="font-size: 22px; font-weight: 700">Refused</div>
<div style="font-size: 15px">Cites ${esc(id)}.</div>
</div>
</div>
<div style="padding: 20px; display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 16px; ${MONO} font-size: 14px">
<span style="color: #3F3C37">confession_id</span><span>${esc(id)}</span>
<span style="color: #3F3C37">error_type</span><span>${esc(et)}</span>
<span style="color: #3F3C37">outcome</span><span>${esc(c ? c.outcome : "false")}</span>
<span style="color: #3F3C37">rule_id</span><span>${esc(rule.rule_id)}</span>
<span style="color: #3F3C37">rule_text</span><span>${esc(rule.rule_text)}</span>
<span style="color: #3F3C37">next_action</span><span>${esc(c ? c.next_action : "refuse")}</span>
</div>
<div style="padding: 0 20px 20px"><button data-act="openInLedger" data-id="${esc(id)}" style="height: 44px; padding: 0 20px; border: 1px solid #161616; border-radius: 0; background: #FFFFFF; color: #161616; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase">View in ledger</button></div>
</div>`;
}

function runView(list) {
  const D = domainSpec();
  const isBusy = busy();
  const done = ui.phase === "done";
  const mem = memFor(list);
  let hint = "Choose a domain and symbol, then press Run.";
  if (ui.phase === "running") hint = "Reading the sources one at a time.";
  else if (ui.writing) hint = "Writing the confession and its rule.";
  else if (ui.justConfessed) hint = "Confession saved. Press Run again.";
  else if (done && ui.result === "allowed") hint = "Sources agree. Turn on Force conflict and run again.";
  else if (done && ui.result === "withheld") hint = "Now press Write confession, then run again.";
  else if (done && ui.result === "refused") hint = "Alea refused because of its own earlier confession.";
  else if (mem && !ui.armed) hint = "A rule exists for this symbol. Turn on Force conflict to see it refuse.";

  const domainOptions = ui.server.domains.map((d) => `<option value="${esc(d.id)}"${d.id === ui.domain ? " selected" : ""}>${esc(d.id)}</option>`).join("");
  const symbolOptions = D.symbols.map((s) => `<option value="${esc(s)}"${s === ui.symbol ? " selected" : ""}>${esc(s)}</option>`).join("");
  const domainRows = ui.server.domains
    .map((d) => {
      const n = list.filter((e) => e.domain === d.id).length;
      const active = d.id === ui.domain;
      return `<button data-act="pickDomain" data-id="${esc(d.id)}"${DIS(isBusy)} aria-pressed="${active}" style="${ROW_BASE}${active ? "background: #161616; color: #FFFFFF" : "background: transparent; color: #161616"}"><span>${esc(d.id)}</span><span>${n === 1 ? "1 rule" : n + " rules"}</span></button>`;
    })
    .join("");
  const log = ui.log
    .map(
      (l) =>
        `<div style="display: flex; gap: 16px; flex-wrap: wrap"><span style="color: #3F3C37; flex-shrink: 0; width: 72px">${esc(l.time)}</span><span style="flex-shrink: 0; width: 96px">${esc(l.who)}</span><span style="flex: 1 1 200px; min-width: 0">${esc(l.text)}</span></div>`,
    )
    .join("");

  return `<div style="max-width: 1200px; margin: 0 auto; padding: 48px 32px 64px; display: flex; flex-direction: column; gap: 40px">

<div style="max-width: 720px">
<h1 style="margin: 0 0 12px; font-size: 44px; line-height: 1.1; font-weight: 700">Claims that can be checked, and refused.</h1>
<p style="margin: 0; font-size: 18px; color: #3F3C37">Alea reads the same fact from three sources. If they disagree, it says so, writes down why, and does not make the same claim again.</p>
</div>

<div style="display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start">

<div style="flex: 0 1 340px; min-width: 280px; display: flex; flex-direction: column; gap: 32px">

<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="${PANEL_HEAD}">Request</div>
<div style="padding: 20px; display: flex; flex-direction: column; gap: 16px">
<label style="${LABEL}">Domain
<select data-act="onDomain" data-fid="domain"${DIS(isBusy)} style="${SELECT}">${domainOptions}</select></label>
<label style="${LABEL}">Symbol
<select data-act="onSymbol" data-fid="symbol"${DIS(isBusy)} style="${SELECT}">${symbolOptions}</select></label>
<div style="display: flex; flex-direction: column; gap: 6px">
<label style="${LABEL}">Tolerance (${esc(D.tol_label)})
<input data-act="onTol" data-fid="tol" type="number" step="any" min="${esc(+(D.tol_min * D.tol_scale).toPrecision(6))}" max="${esc(+(D.tol_max * D.tol_scale).toPrecision(6))}" value="${esc(+(D.tol * D.tol_scale).toPrecision(6))}"${DIS(isBusy)} style="${SELECT}"></label>
<div style="font-size: 14px; color: #3F3C37">${D.tol_custom ? "Your setting. Default is " + esc(+(D.tol_default * D.tol_scale).toPrecision(6)) + " " + esc(D.tol_label) + "." : "Default. Sources further apart than this count as a conflict."}</div>
${D.tol_custom ? `<button data-act="doTolReset" data-fid="tolreset"${DIS(isBusy)} style="height: 36px; border: 1px solid #161616; border-radius: 0; background: #FFFFFF; color: #161616; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase">Use default</button>` : ""}
</div>
<button data-act="doRun" data-fid="run"${DIS(isBusy)} style="height: 48px; border: 1px solid #161616; border-radius: 0; background: #161616; color: #FFFFFF; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600">${ui.phase === "running" ? "Reading…" : "Run"}</button>
<div style="display: flex; flex-direction: column; gap: 8px; padding-top: 16px; border-top: 1px solid #161616">
<button data-act="doToggleConflict" data-fid="conflict" aria-pressed="${ui.armed}"${DIS(isBusy)} style="${BTN_BASE}${ui.armed ? "background: #161616; color: #FFFFFF" : "background: #FFFFFF; color: #161616"}">${ui.armed ? "Force conflict: on" : "Force conflict: off"}</button>
<button data-act="doConfess" data-fid="confess"${DIS(cannotConfess())} style="height: 44px; border: 1px solid #161616; border-radius: 0; background: #FFFFFF; color: #161616; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase">Write confession</button>
<button data-act="doReset" data-fid="reset"${DIS(isBusy)} style="height: 44px; border: 1px solid #161616; border-radius: 0; background: #FFFFFF; color: #161616; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase">Clear memory</button>
</div>
<div style="font-size: 14px; color: #3F3C37" aria-live="polite">${esc(hint)}</div>
</div>
</div>

<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="${PANEL_HEAD}">Domains</div>
<div style="${MONO} font-size: 14px">${domainRows}</div>
</div>

</div>

<div style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 32px">

<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="padding: 12px 20px; border-bottom: 1px solid #161616; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; ${KICK}"><span style="font-weight: 600">Result</span><span style="color: #3F3C37">${esc(ui.domain + " / " + ui.symbol + " / " + D.label)}</span></div>
<div aria-live="polite">${verdictBlock()}</div>
${sourcesBlock(D)}
</div>

${confessionPanel(list)}

<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="${PANEL_HEAD}">Activity</div>
<div style="padding: 16px 20px; ${MONO} font-size: 13px; line-height: 1.8">${log}</div>
</div>

</div>
</div>
</div>`;
}

function ledgerView(list) {
  const domainsWith = [];
  list.forEach((e) => {
    if (domainsWith.indexOf(e.domain) < 0) domainsWith.push(e.domain);
  });
  const lfilter = domainsWith.indexOf(ui.lfilter) < 0 ? "all" : ui.lfilter;
  const shown = list.filter((e) => lfilter === "all" || e.domain === lfilter);
  const sel = shown.find((e) => e.id === ui.sel) || shown[0] || null;
  const stat = (label, value, last) =>
    `<div style="flex: 1 1 200px; padding: 20px 24px${last ? "" : "; border-right: 1px solid #161616"}"><div style="${KICK} color: #3F3C37">${label}</div><div style="font-size: 36px; font-weight: 700">${esc(value)}</div></div>`;

  let body;
  if (list.length === 0) {
    body = `<div style="border: 1px solid #161616; background: #FFFFFF; padding: 28px 24px">
<div style="font-size: 24px; font-weight: 700">Nothing here yet.</div>
<div style="font-size: 17px; margin: 6px 0 16px">Memory is empty. On the Run screen, turn on Force conflict, run it, then write a confession.</div>
<button data-act="goRun" style="height: 48px; padding: 0 24px; border: 1px solid #161616; border-radius: 0; background: #161616; color: #FFFFFF; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600">Go to Run</button>
</div>`;
  } else {
    const filters = ["all"]
      .concat(domainsWith)
      .map((f) => `<button data-act="filter" data-id="${esc(f)}" aria-pressed="${f === lfilter}" style="${CHIP_BASE}${f === lfilter ? "background: #161616; color: #FFFFFF" : "background: #FFFFFF; color: #161616"}">${esc(f)}</button>`)
      .join("");
    const rows = shown
      .map((e) => {
        const on = sel && e.id === sel.id;
        return `<button class="lrow" data-act="sel" data-id="${esc(e.id)}" aria-pressed="${!!on}" style="${LROW_BASE}${on ? "background: #161616; color: #FFFFFF" : "background: transparent; color: #161616"}"><span>${esc(e.id)}</span><span>${esc(e.domain)}</span><span>${esc(e.symbol)}</span><span>${esc(e.rule)}</span><span>${esc(e.refusals)}</span><span>${esc(e.date)}</span></button>`;
      })
      .join("");
    const ruleRows = shown
      .map((e) => {
        const on = sel && e.id === sel.id;
        return `<div style="padding: 18px 20px; border-bottom: 1px solid #C9C6BC; ${on ? "background: #FFFFFF; border-left: 4px solid #161616" : "background: transparent; border-left: 4px solid transparent"}">
<div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; ${MONO} font-size: 14px"><span style="font-weight: 600">${esc(e.rule)}</span><span style="color: #3F3C37">from ${esc(e.id)}</span></div>
<div style="margin-top: 6px; font-size: 17px">${esc(e.text)}</div>
</div>`;
      })
      .join("");
    const s = sel || { id: "", claim: "", sources: "", status: "", confidence: "", outcome: "", next: "", refusals: 0 };
    body = `<div>
<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px">
<h2 style="margin: 0; font-size: 24px; font-weight: 700">Confessions</h2>
<div style="display: flex; gap: 8px; flex-wrap: wrap">${filters}</div>
</div>
<div style="overflow-x: auto">
<div style="min-width: 900px; border: 1px solid #161616; background: #FAFAF7; ${MONO} font-size: 14px">
<div style="display: grid; grid-template-columns: 1.4fr 0.8fr 0.7fr 1.1fr 0.8fr 1.1fr; gap: 16px; padding: 12px 20px; border-bottom: 1px solid #161616; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #3F3C37"><span>ID</span><span>Domain</span><span>Symbol</span><span>Rule</span><span>Refusals</span><span>Date</span></div>
${rows}
</div>
</div>
</div>

<div style="display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start">

<div style="flex: 999 1 560px; min-width: 0">
<h2 style="margin: 0 0 12px; font-size: 24px; font-weight: 700">Rules in force</h2>
<div style="border: 1px solid #161616; background: #FAFAF7">${ruleRows}</div>
</div>

<div style="flex: 1 1 320px; min-width: 280px">
<h2 style="margin: 0 0 12px; font-size: 24px; font-weight: 700">Selected confession</h2>
<div style="border: 1px solid #161616; background: #FAFAF7">
<div style="padding: 12px 20px; background: #161616; color: #FFFFFF; ${MONO} font-size: 13px; letter-spacing: 0.04em">${esc(s.id)}</div>
<div style="padding: 20px; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 14px; ${MONO} font-size: 13px">
<span style="color: #3F3C37">claim</span><span>${esc(s.claim)}</span>
<span style="color: #3F3C37">sources</span><span>${esc(s.sources)}</span>
<span style="color: #3F3C37">status</span><span>${esc(s.status)}</span>
<span style="color: #3F3C37">confidence</span><span>${esc(s.confidence)}</span>
<span style="color: #3F3C37">outcome</span><span style="color: #9A2B1F; font-weight: 600">${esc(s.outcome)}</span>
<span style="color: #3F3C37">next action</span><span>${esc(s.next)}</span>
<span style="color: #3F3C37">refused since</span><span>${esc(s.refusals)} times</span>
</div>
</div>
</div>

</div>`;
  }

  return `<div style="max-width: 1200px; margin: 0 auto; padding: 48px 32px 64px; display: flex; flex-direction: column; gap: 40px">

<div style="max-width: 720px">
<h1 style="margin: 0 0 12px; font-size: 44px; line-height: 1.1; font-weight: 700">The ledger.</h1>
<p style="margin: 0; font-size: 18px; color: #3F3C37">Every mistake Alea has owned, and the rule it wrote so the mistake is not repeated. Confessions written on the Run screen appear here at once.</p>
</div>

<div style="display: flex; flex-wrap: wrap; border: 1px solid #161616; background: #FAFAF7">
${stat("Confessions", list.length)}${stat("Active rules", ui.server.rules.length)}${stat("Refusals", ui.server.refusal_total || 0)}${stat("Domains", domainsWith.length, true)}
</div>

${body}
</div>`;
}

function render() {
  if (!ui.ready) {
    app.textContent = ui.error ? "Could not reach the Alea server: " + ui.error : "Loading Alea…";
    return;
  }
  const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
  const list = entries();
  const m = ui.server.mode;
  const ruleCount = ui.server.rules.length;
  app.removeAttribute("style");
  app.innerHTML = `<div style="min-height: 100vh; background: #ECEAE3; color: #161616; font-family: 'Source Serif 4', Georgia, serif; font-size: 16px; line-height: 1.5">

<div style="border-bottom: 2px solid #161616; background: #ECEAE3">
<div style="max-width: 1200px; margin: 0 auto; padding: 0 32px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 40px; min-height: 72px">
<div style="font-size: 30px; font-weight: 700; letter-spacing: 0.01em">Alea</div>
<nav style="display: flex; gap: 28px; flex-grow: 1">
<button class="navbtn" data-act="goRun" data-fid="navrun"${ui.view === "run" ? ' aria-current="page"' : ""} style="${NAV_BASE}${ui.view === "run" ? NAV_ON : ""}">Run</button>
<button class="navbtn" data-act="goLedger" data-fid="navledger"${ui.view === "ledger" ? ' aria-current="page"' : ""} style="${NAV_BASE}${ui.view === "ledger" ? NAV_ON : ""}">Ledger (${ruleCount})</button>
</nav>
<div style="display: flex; gap: 12px; flex-wrap: wrap; ${MONO} font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em">
<div style="border: 1px solid #161616; padding: 6px 12px; background: #FAFAF7">Rules in memory: ${ruleCount}</div>
<div style="border: 1px solid #161616; padding: 6px 12px; background: #FAFAF7" title="data: ${esc(m.data)} · prose: ${esc(m.llm)} · memory: ${esc(m.memory)}">${m.sample ? "Sample mode" : "Live data"}</div>
</div>
</div>
</div>

${ui.view === "run" ? runView(list) : ledgerView(list)}

<div style="border-top: 2px solid #161616">
<div style="max-width: 1200px; margin: 0 auto; padding: 20px 32px 32px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; ${KICK} color: #3F3C37">
<span>Open Agent Hackathon 2026 · Zetaris · Meterless H-MEM · Nightshift</span>
<a class="footlink" href="/classic.html">Classic view</a>
</div>
</div>

</div>`;
  if (focused) {
    const el = app.querySelector(`[data-fid="${focused}"]`);
    if (el && !el.disabled) el.focus();
  }
}

// ---------- events ----------

app.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-act]");
  if (!el || el.disabled) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case "goRun":
      ui.view = "run";
      return render();
    case "goLedger":
      ui.view = "ledger";
      return render();
    case "openInLedger":
      Object.assign(ui, { view: "ledger", lfilter: "all", sel: id || null });
      window.scrollTo(0, 0);
      return render();
    case "pickDomain":
      return pickDomain(id);
    case "doRun":
      return doRun();
    case "doToggleConflict":
      ui.armed = !ui.armed;
      return render();
    case "doTolReset":
      return doSetTol("");
    case "doConfess":
      return doConfess();
    case "doReset":
      return doReset();
    case "filter":
      ui.lfilter = id;
      return render();
    case "sel":
      ui.sel = id;
      return render();
  }
});

app.addEventListener("change", (e) => {
  const el = e.target.closest("select[data-act]");
  if (!el) return;
  if (el.dataset.act === "onDomain") pickDomain(el.value);
  if (el.dataset.act === "onSymbol") {
    resetView({ symbol: el.value });
    render();
  }
});

app.addEventListener("change", (e) => {
  const el = e.target.closest("input[data-act='onTol']");
  if (el) doSetTol(el.value);
});

// ---------- boot ----------

try {
  await refreshState();
  ui.ready = true;
  ui.domain = ui.server.domains[0].id;
  ui.symbol = ui.server.domains[0].symbols[0];
  addLog("alea", ui.server.mode.sample ? "ready, sample mode" : "ready, live data");
} catch (err) {
  ui.error = err.message;
}
render();
