// Alea UI. Everything shown here comes from the backend API (src/server.ts).
// No numbers are invented in the browser.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = { mode: {}, providers: {}, rules: [], confessions: [], tolerance: 1 };
let selectedId = null;
let busy = false;

// ---------- helpers ----------

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (v) => (v === null || v === undefined ? "n/a" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`);
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString() : "");
const date = (iso) => (iso ? new Date(iso).toLocaleString() : "");
const authorTag = (a) => `<span class="tag">${a === "nightshift" ? "Written via Nightshift" : "Template text"}</span>`;

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
const post = (path, body = {}) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function showError(msg) {
  const el = $("#error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setBusy(on) {
  busy = on;
  $("#run").disabled = on;
  $("#force").disabled = on;
  $("#run").textContent = on ? "Reading…" : "Run";
}

// ---------- status / header ----------

function renderStatus() {
  const m = state.mode || {};
  const p = state.providers || {};
  const zetaris = p.zetaris === "live" ? "Zetaris live" : p.zetaris === "direct" ? "Public APIs" : "Fixtures";
  const meterless = p.meterless === "live" ? "Meterless H-MEM" : "Memory fallback";
  const nightshift = p.nightshift === "live" ? "Nightshift live" : "Templates";
  $("#status").innerHTML = [
    `<span class="chip on">${m.sample ? "Sample mode" : "Live"}</span>`,
    `<span class="chip ${p.zetaris === "live" ? "on" : ""}">${zetaris}</span>`,
    `<span class="chip ${p.meterless === "live" ? "on" : "warn"}" title="${p.meterless === "live" ? "" : "Run npm run setup to install the H-MEM engine"}">${meterless}</span>`,
    `<span class="chip ${p.nightshift === "live" ? "on" : ""}">${nightshift}</span>`,
  ].join("");
  $("#nav-count").textContent = state.confessions.length;
  // Sample data only matters in sample mode; live mode reads real sources.
  const seg = $("#scenario-field .seg");
  seg.classList.toggle("disabled", !m.sample);
  $("#scenario-field .label").textContent = m.sample ? "Sample data" : "Sample data (off in live mode)";
}

// ---------- run view ----------

function sourcesBlock(b) {
  const tol = b.tolerance;
  const values = b.readings.map((r) => r.value).filter((v) => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const rows = b.readings
    .map((r) => {
      const out = r.value !== null && r.value > min + tol + 1e-9;
      return `<tr class="${out ? "out" : ""}"><td>${esc(r.source)}</td><td class="num">${r.value === null ? `n/a <span class="muted">${esc(r.error || "")}</span>` : pct(r.value)}</td></tr>`;
    })
    .join("");
  let bar = "";
  if (values.length) {
    const max = Math.max(...values);
    const lo = min - tol * 0.6;
    const hi = Math.max(min + tol, max) + tol * 0.6;
    const span = hi - lo || 1;
    const ticks = values
      .map((v) => `<span class="tick ${v > min + tol + 1e-9 ? "out" : ""}" style="left: calc(${((v - lo) / span) * 100}% - 2px)"></span>`)
      .join("");
    bar = `<div class="bar" aria-hidden="true"><span class="zone" style="left:${((min - lo) / span) * 100}%;width:${(tol / span) * 100}%"></span>${ticks}</div>
      <p class="caption">Each mark is one source. The grey block is the agreement zone (${tol} pp); a red mark falls outside it.</p>`;
  }
  const via = { fixture: "sample fixtures", zetaris: "Zetaris SQL", direct: "public APIs" }[b.via] || b.via;
  return `<div class="block"><h3>Sources · ${esc(b.symbol)} 24h change · via ${esc(via)}</h3>
    <table class="table"><thead><tr><th>Source</th><th class="num">Reading</th></tr></thead><tbody>${rows}
    <tr><td><b>Spread</b></td><td class="num"><b>${b.spread === null ? "n/a" : `${b.spread} pp`}</b> · ${esc(b.status)}</td></tr>
    <tr><td>Consensus (median)</td><td class="num">${pct(b.consensus)}</td></tr></tbody></table>
    ${bar}${b.query ? `<pre class="sql">${esc(b.query)}</pre>` : ""}</div>`;
}

function claimBlock(c) {
  return `<div class="block"><h3>Claim ${authorTag(c.author)}</h3>
    <p class="prose">${esc(c.text)}</p>
    <dl class="kv"><dt>confidence</dt><dd>${c.confidence}</dd><dt>rationale</dt><dd>${esc(c.rationale)}</dd></dl></div>`;
}

function confessionBlock(conf, rule) {
  return `<div class="block"><h3>Confession written ${authorTag(conf.narrative_author)}</h3>
    <p class="prose">${esc(conf.narrative)}</p>
    <dl class="kv">
      <dt>confession_id</dt><dd>${esc(conf.confession_id)}</dd>
      <dt>error_type</dt><dd>${esc(conf.error_type)}</dd>
      <dt>rule_id</dt><dd>${esc(rule?.rule_id || conf.rule_id)}</dd>
      <dt>rule_text</dt><dd>${esc(rule?.rule_text || conf.rule_text)}</dd>
      <dt>H-MEM memory</dt><dd>${esc(conf.memory_id)}</dd>
    </dl>
    <p><button type="button" class="btn link" data-open="${esc(conf.confession_id)}">View in ledger</button></p></div>`;
}

function refusalBlock(ref) {
  const hits = ref.recall?.hits || [];
  const recalled = hits.length
    ? `<table class="table"><thead><tr><th>Memory</th><th class="num">Relevance</th></tr></thead><tbody>${hits
        .map((h) => `<tr><td>${esc(h.id)}<br><span class="muted">${esc(h.content.slice(0, 160))}${h.content.length > 160 ? "…" : ""}</span></td><td class="num">${h.relevance}</td></tr>`)
        .join("")}</tbody></table>`
    : `<p class="muted">No memories recalled.</p>`;
  return `<div class="block"><h3>Rule applied</h3>
    <dl class="kv"><dt>rule</dt><dd>${esc(ref.rule.rule_id)}: ${esc(ref.rule.rule_text)}</dd>
    <dt>cites</dt><dd>${esc(ref.rule.confession_id)}</dd></dl>
    <p><button type="button" class="btn link" data-open="${esc(ref.rule.confession_id)}">View cited confession</button></p></div>
    <div class="block"><h3>Recalled from Meterless H-MEM · ${esc(ref.recall?.strategy || "")}</h3>${recalled}</div>`;
}

function renderResult(r) {
  $("#result-sub").textContent = `${r.symbol} · above ${pct(r.threshold)}`;
  let verdict;
  if (r.decision === "stands") {
    verdict = `<div class="verdict stands"><span class="kicker">Verdict</span><strong>Claim stands</strong><p>All sources agree and every reading is above the threshold.</p></div>`;
  } else if (r.decision === "confess") {
    verdict = `<div class="verdict confess"><span class="kicker">Verdict</span><strong>Confessed</strong><p>The claim failed (${esc(r.confession.error_type)}). Rule ${esc(r.rule.rule_id)} is now in force. Press Run again with the same settings to see Alea refuse.</p></div>`;
  } else {
    verdict = `<div class="verdict refuse"><span class="kicker">Verdict</span><strong>Refused</strong><p>This request matches confession ${esc(r.refusal.rule.confession_id)}, so no new claim is made.</p></div>`;
  }
  let body = verdict + sourcesBlock(r.bundle);
  if (r.claim) body += claimBlock(r.claim);
  if (r.decision === "confess") body += confessionBlock(r.confession, r.rule);
  if (r.decision === "refuse") body += refusalBlock(r.refusal);
  $("#result").innerHTML = body;
}

async function renderTrace() {
  const events = await api("/api/trace").catch(() => []);
  const tb = $("#trace");
  if (!events.length) {
    tb.innerHTML = `<tbody><tr><td class="empty">No events yet.</td></tr></tbody>`;
    return;
  }
  tb.innerHTML =
    `<thead><tr><th>Time</th><th>From → To</th><th>Type</th><th>Summary</th></tr></thead><tbody>` +
    events
      .slice()
      .reverse()
      .map((e) => `<tr><td>${time(e.ts)}</td><td>${esc(e.from)} → ${esc(e.to)}</td><td>${esc(e.type)}</td><td>${esc(e.summary)}</td></tr>`)
      .join("") +
    `</tbody>`;
}

async function run(force = false) {
  if (busy) return;
  showError("");
  setBusy(true);
  const symbol = $('input[name="asset"]:checked').value;
  const threshold = $("#threshold").value;
  const scenario = $('input[name="scenario"]:checked').value;
  try {
    const r = await post("/api/run", { symbol, threshold, scenario, force });
    renderResult(r);
    await refresh();
    const next = {
      stands: "Claim stood. Try Conflict, a higher threshold, or Force confession.",
      confess: "Now press Run again with the same settings.",
      refuse: "Alea refused because of its own earlier confession.",
    };
    $("#hint").textContent = next[r.decision];
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(false);
  }
}

// ---------- ledger view ----------

function renderLedger() {
  const { confessions, rules, mode, providers } = state;
  $("#stats").innerHTML = [
    ["Confessions", confessions.length],
    ["Active rules", rules.length],
    ["Memory", providers.meterless === "live" ? "H-MEM" : "Fallback"],
    ["Data", { fixture: "Sample", zetaris: "Zetaris", direct: "Public" }[mode.data] || "—"],
  ]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${esc(v)}</b></div>`)
    .join("");

  if (!confessions.length) {
    $("#confessions").innerHTML = `<p class="empty">Nothing here yet. On the Run screen, set Sample data to Conflict and press Run.</p>`;
    $("#selected").innerHTML = `<p class="muted">Select a confession.</p>`;
    $("#rules").innerHTML = `<p class="empty">No rules yet.</p>`;
    return;
  }
  if (!confessions.some((c) => c.confession_id === selectedId)) selectedId = confessions[0].confession_id;

  $("#confessions").innerHTML =
    `<div class="scroll"><table class="table"><thead><tr><th>ID</th><th>Symbol</th><th>Error</th><th>Rule</th><th>Date</th></tr></thead><tbody>` +
    confessions
      .map(
        (c) => `<tr class="click ${c.confession_id === selectedId ? "sel" : ""}" data-id="${esc(c.confession_id)}" tabindex="0">
          <td>${esc(c.confession_id)}</td><td>${esc(c.symbol)}</td><td>${esc(c.error_type)}</td><td>${esc(c.rule_id)}</td><td>${date(c.created_at)}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div>`;

  $("#rules").innerHTML = rules
    .map((r) => `<div class="rule"><b>${esc(r.rule_id)}</b><span class="muted">from ${esc(r.confession_id)}</span><div>${esc(r.rule_text)}</div></div>`)
    .join("");

  renderSelected();
}

async function renderSelected() {
  const c = state.confessions.find((x) => x.confession_id === selectedId);
  if (!c) return;
  $("#selected").innerHTML = `
    <p class="prose">${esc(c.narrative)}</p>
    <dl class="kv">
      <dt>claim</dt><dd>${esc(c.claim)}</dd>
      <dt>sources</dt><dd>${esc(c.sources.join(", "))}</dd>
      <dt>status</dt><dd>${esc(c.source_status)}</dd>
      <dt>confidence</dt><dd>${c.confidence}</dd>
      <dt>outcome</dt><dd>${esc(c.outcome)}${c.forced ? " (forced)" : ""}</dd>
      <dt>rule</dt><dd>${esc(c.rule_id)}: ${esc(c.rule_text)}</dd>
      <dt>next action</dt><dd>${esc(c.next_action)}</dd>
      <dt>H-MEM memory</dt><dd>${esc(c.memory_id)}</dd>
    </dl>
    <div class="block"><h3>H-MEM audit ledger</h3><div id="audit"><p class="muted">Loading…</p></div></div>`;
  try {
    const lines = await api(`/api/audit/${encodeURIComponent(c.memory_id)}`);
    if (c.confession_id !== selectedId) return;
    $("#audit").innerHTML = lines.length
      ? `<table class="table"><thead><tr><th>Action</th><th>Actor</th><th>When</th><th>Detail</th></tr></thead><tbody>${lines
          .map((l) => `<tr><td>${esc(l.action)}</td><td>${esc(l.actor)}</td><td>${time(l.at)}</td><td>${esc(l.detail || "")}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">No ledger entries yet.</p>`;
  } catch (err) {
    $("#audit").innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

// ---------- navigation / wiring ----------

function show(view) {
  $("#view-run").hidden = view !== "run";
  $("#view-ledger").hidden = view !== "ledger";
  $$(".navbtn").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  if (view === "ledger") renderLedger();
  window.scrollTo(0, 0);
}

async function refresh() {
  state = await api("/api/state");
  renderStatus();
  if (!$("#view-ledger").hidden) renderLedger();
  await renderTrace();
}

$$(".navbtn").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
$("#run").addEventListener("click", () => run(false));
$("#force").addEventListener("click", () => run(true));

$$('input[name="asset"]').forEach((i) =>
  i.addEventListener("change", () => {
    $("#threshold").value = i.value === "BTC" ? 5 : 3;
  }),
);

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) {
    selectedId = open.dataset.open;
    show("ledger");
    return;
  }
  const row = e.target.closest("tr[data-id]");
  if (row) {
    selectedId = row.dataset.id;
    renderLedger();
  }
});
document.addEventListener("keydown", (e) => {
  const row = e.target.closest?.("tr[data-id]");
  if (row && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    selectedId = row.dataset.id;
    renderLedger();
  }
});

$("#reset").addEventListener("click", async () => {
  if (busy || !confirm("Clear all rules, confessions, H-MEM memory and the trace?")) return;
  try {
    await post("/api/reset");
    selectedId = null;
    $("#result").innerHTML = `<div class="verdict idle"><span class="kicker">Waiting</span><strong>Ready</strong><p>Memory cleared. Press Run to read the sources.</p></div>`;
    $("#result-sub").textContent = "";
    await refresh();
  } catch (err) {
    showError(err.message);
  }
});

refresh().catch((err) => showError(`Cannot reach the server: ${err.message}`));
