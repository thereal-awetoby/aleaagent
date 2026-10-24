const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DOMAINS = {
  crypto: {
    symbols: ["BTC", "ETH", "SOL"],
    metric: "24h change",
    sources: ["coingecko", "binance", "coinpaprika"],
    aligned: [5.42, 5.38, 5.51],
    conflict: [5.84, 4.12, 6.21],
    tol: "Conflict when the spread is more than 1.0 percentage point.",
    prefix: "R-CRYPTO",
    fmt: "pct",
    live: true,
  },
  equities: {
    symbols: ["AAPL", "TSLA", "NVDA"],
    metric: "daily change",
    sources: ["stooq", "yahoo", "finnhub"],
    aligned: [1.2, 1.3, 1.1],
    conflict: [1.2, 3.1, 1.0],
    tol: "Conflict when the spread is more than 1.0 percentage point.",
    prefix: "R-EQ",
    fmt: "pct",
    live: false,
  },
  forex: {
    symbols: ["EURUSD", "GBPUSD", "USDJPY"],
    metric: "daily change",
    sources: ["frankfurter", "ecb", "exchangerate-api"],
    aligned: [0.2, 0.3, 0.2],
    conflict: [0.2, 1.6, 0.1],
    tol: "Conflict when the spread is more than 1.0 percentage point.",
    prefix: "R-FX",
    fmt: "pct",
    live: false,
  },
  defi: {
    symbols: ["eth-gas", "eth-tvl"],
    metric: "gas",
    sources: ["defillama", "etherscan", "public-rpc"],
    aligned: [24, 25, 24],
    conflict: [24, 31, 23],
    tol: "Conflict when the spread is more than 15% of the midpoint.",
    prefix: "R-DEFI",
    fmt: "gwei",
    live: false,
  },
  weather: {
    symbols: ["Lagos", "London", "Tokyo"],
    metric: "temperature",
    sources: ["open-meteo", "wttr.in", "openweather"],
    aligned: [28.0, 28.2, 27.9],
    conflict: [28.0, 34.0, 27.5],
    tol: "Conflict when the spread is more than 2.0 °C.",
    prefix: "R-WX",
    fmt: "c",
    live: false,
  },
};

const STORE = "alea-fixture-memory-v1";
let state = { mode: null, rules: [], confessions: [], providers: {} };
let ui = { domain: "crypto", symbol: "BTC", armed: false, view: "run", busy: false };

function fmt(kind, v) {
  if (kind === "pct") return `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
  if (kind === "c") return `${Number(v).toFixed(1)} °C`;
  return `${Number(v).toFixed(0)} gwei`;
}

function isLiveSymbol(domain, symbol) {
  return domain === "crypto" && (symbol === "BTC" || symbol === "ETH");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function loadFixtureMem() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}
function saveFixtureMem(m) {
  localStorage.setItem(STORE, JSON.stringify(m));
}

function setPipe(a, c, f) {
  $('[data-step="aggregate"]').textContent = a;
  $('[data-step="claim"]').textContent = c;
  $('[data-step="confess"]').textContent = f;
}

function renderStatus() {
  const p = state.providers || {};
  const mode = state.mode || {};
  $("#status").innerHTML = `
    <span class="modechip">${mode.sample ? "SAMPLE_MODE" : "LIVE"}</span>
    <span>Zetaris ${p.zetaris === "live" ? "Live" : p.zetaris === "direct" ? "Public APIs" : "Fixtures"}</span>
    <span>Meterless ${p.meterless === "live" || p.meterless === "H-MEM live" ? "H-MEM" : (p.meterless || "—")}</span>
    <span>Nightshift ${p.nightshift === "live" ? "Live" : "Templates"}</span>`;
  $("#mode-label").textContent = mode.sample ? "SAMPLE" : "LIVE";
}

function fillDomainUI() {
  const list = $("#domain-list");
  list.innerHTML = "";
  const sel = $("#domain");
  sel.innerHTML = "";
  for (const id of Object.keys(DOMAINS)) {
    const n = (state.confessions || []).filter((c) => (c.domain || "crypto") === id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drow" + (id === ui.domain ? " on" : "");
    btn.innerHTML = `<span>${id}</span><span class="meta">${n ? n + " rules" : "—"}</span>`;
    btn.onclick = () => {
      ui.domain = id;
      ui.symbol = DOMAINS[id].symbols[0];
      fillDomainUI();
      updateTitle();
    };
    list.appendChild(btn);
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    if (id === ui.domain) opt.selected = true;
    sel.appendChild(opt);
  }
  const sym = $("#symbol");
  sym.innerHTML = "";
  for (const s of DOMAINS[ui.domain].symbols) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    if (s === ui.symbol) o.selected = true;
    sym.appendChild(o);
  }
  $("#threshold").value = ui.domain === "crypto" && ui.symbol === "ETH" ? 3 : ui.domain === "crypto" ? 5 : 1;
  updateTitle();
}

function updateTitle() {
  const D = DOMAINS[ui.domain];
  $("#title-line").textContent = `${ui.domain} / ${ui.symbol} / ${D.metric}`;
  $("#tol-line").textContent = D.tol + (isLiveSymbol(ui.domain, ui.symbol) ? " · Live agent API for this symbol." : " · Local fixture for this domain.");
  $("#live-note").textContent = isLiveSymbol(ui.domain, ui.symbol)
    ? "This symbol runs on the real Alea agent API."
    : "This domain uses local fixtures until the agent pack is live.";
}

function renderTrace(events) {
  const tb = $("#trace tbody");
  if (!events?.length) {
    tb.innerHTML = `<tr><td colspan="4">No events yet.</td></tr>`;
    return;
  }
  tb.innerHTML = events
    .slice()
    .reverse()
    .map((e) => {
      const t = e.at || e.time || e.timestamp || "";
      const time = t ? new Date(t).toLocaleTimeString([], { hour12: false }) : "—";
      return `<tr><td>${time}</td><td>${e.handoff || e.from || "—"}</td><td>${e.event || e.type || "—"}</td><td>${e.detail || e.message || ""}</td></tr>`;
    })
    .join("");
}

function renderResultFromLive(result) {
  const decision = result.decision || result.outcome || {};
  const status = result.bundle?.status || result.source_status || "—";
  const refused = /refus/i.test(String(decision.action || decision.result || result.action || "")) || result.refused;
  const confessed = result.confession || result.rule_id;
  let decClass = "hold";
  let decText = "Decision";
  if (refused) {
    decClass = "refuse";
    decText = "Refused";
  } else if (String(result.outcome || decision.outcome) === "false" || result.confession) {
    decClass = "hold";
    decText = "Confessed";
  } else if (status === "aligned") {
    decClass = "ok";
    decText = "Claim stands";
  }

  const sources = result.bundle?.sources || result.sources || [];
  const rows = Array.isArray(sources)
    ? sources
        .map((s) => {
          if (typeof s === "object") {
            const name = s.name || s.source || "—";
            const val = s.value ?? s.change ?? s.pct ?? "—";
            return `<tr><td>${name}</td><td>${typeof val === "number" ? val.toFixed(2) + "%" : val}</td><td>${s.note || s.vs || ""}</td></tr>`;
          }
          return "";
        })
        .join("")
    : "";

  const claim = result.claim?.text || result.claim || decision.claim || "—";
  const conf = result.claim?.confidence ?? result.confidence;
  const rule = result.rule || result.rule_text || (result.rule_id ? result.rule_id : "");
  const narrative = result.confession?.narrative || result.narrative || "";

  setPipe(
    status === "conflict" ? `conflict` : status === "aligned" ? "aligned" : String(status),
    refused ? "Skipped" : conf != null ? `Confidence ${Number(conf).toFixed(2)}` : "—",
    refused ? `Refused` : result.rule_id ? `${result.rule_id} issued` : "—",
  );

  $("#result").innerHTML = `
    <div class="card">
      <h3>Decision</h3>
      <div class="decision ${decClass}">${decText}</div>
      <p class="sub">${typeof claim === "string" ? claim : JSON.stringify(claim)}</p>
      ${rule ? `<p class="mono">${rule}</p>` : ""}
      ${narrative ? `<div class="quote">${narrative}</div>` : ""}
    </div>
    ${
      rows
        ? `<div class="card"><h3>Sources</h3><table class="sources"><thead><tr><th>Source</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:10px"><span class="tag ${status}">${status}</span>
      ${result.bundle?.spread != null ? ` · spread ${result.bundle.spread}` : ""}
      ${result.bundle?.tolerance != null ? ` · tol ${result.bundle.tolerance}` : ""}</p></div>`
        : ""
    }
  `;
}

function renderFixtureResult(D, vals, conflict, mem) {
  const spread = Math.max(...vals) - Math.min(...vals);
  if (!conflict) {
    setPipe(`aligned, spread ${spread.toFixed(2)}`, "Confidence 0.66", "Not needed");
    $("#result").innerHTML = `
      <div class="card">
        <h3>Decision</h3>
        <div class="decision ok">Claim stands</div>
        <p class="sub">${ui.symbol} ${D.metric} across sources</p>
        <p>All sources agree within tolerance.</p>
      </div>
      <div class="card"><h3>Sources</h3>
        <table class="sources"><thead><tr><th>Source</th><th>Value</th></tr></thead>
        <tbody>${D.sources.map((n, i) => `<tr><td>${n}</td><td>${fmt(D.fmt, vals[i])}</td></tr>`).join("")}</tbody></table>
        <p style="margin-top:10px"><span class="tag aligned">aligned</span> · spread ${spread.toFixed(2)}</p>
      </div>`;
    return;
  }
  if (mem) {
    setPipe(`conflict, spread ${spread.toFixed(2)}`, "Skipped", `Refused under ${mem.rule}`);
    $("#result").innerHTML = `
      <div class="card">
        <h3>Decision</h3>
        <div class="decision refuse">Refused</div>
        <p class="sub">${mem.rule} blocked this claim, citing ${mem.id}</p>
        <div class="quote">${mem.text}</div>
      </div>`;
    return;
  }
  setPipe(`conflict, spread ${spread.toFixed(2)}`, "Confidence 0.41", "Withheld");
  $("#result").innerHTML = `
    <div class="card">
      <h3>Decision</h3>
      <div class="decision hold">Withheld — conflict not averaged</div>
      <p class="sub">Sources disagree. Press Run again after memory has a rule, or use Force confession on live crypto.</p>
    </div>
    <div class="card"><h3>Sources</h3>
      <table class="sources"><thead><tr><th>Source</th><th>Value</th></tr></thead>
      <tbody>${D.sources.map((n, i) => `<tr><td>${n}</td><td>${fmt(D.fmt, vals[i])}</td></tr>`).join("")}</tbody></table>
      <p style="margin-top:10px"><span class="tag conflict">conflict</span> · spread ${spread.toFixed(2)}</p>
    </div>`;
}

async function refreshState() {
  try {
    state = await api("/api/state");
  } catch (e) {
    state = { mode: { sample: true }, providers: {}, rules: [], confessions: [] };
    $("#error").hidden = false;
    $("#error").textContent = "API offline: " + e.message;
  }
  renderStatus();
  fillDomainUI();
  renderLedger();
  try {
    const tr = await api("/api/trace");
    renderTrace(Array.isArray(tr) ? tr : tr.events || tr.trace || []);
  } catch {
    /* ignore */
  }
}

function renderLedger() {
  const conf = state.confessions || [];
  const empty = $("#ledger-empty");
  const table = $("#ledger-table");
  const tb = table.querySelector("tbody");
  empty.hidden = conf.length > 0;
  table.hidden = conf.length === 0;
  tb.innerHTML = conf
    .map(
      (c) => `<tr data-id="${c.confession_id || c.id}">
      <td class="mono">${c.confession_id || c.id || "—"}</td>
      <td>${c.domain || "crypto"}</td>
      <td>${c.symbol || "—"}</td>
      <td class="mono">${c.rule_id || "—"}</td>
      <td>${c.error_type || "—"}</td>
      <td>${c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</td>
    </tr>`,
    )
    .join("");
  $$("#ledger-table tbody tr").forEach((tr) => {
    tr.onclick = () => {
      const id = tr.getAttribute("data-id");
      const c = conf.find((x) => (x.confession_id || x.id) === id);
      const box = $("#ledger-detail");
      if (!c) return;
      box.hidden = false;
      box.innerHTML = `<h3>Confession</h3>
        <dl class="kv">
          <dt>Id</dt><dd class="mono">${c.confession_id || c.id}</dd>
          <dt>Rule</dt><dd class="mono">${c.rule_id || "—"}</dd>
          <dt>Claim</dt><dd>${c.claim || "—"}</dd>
          <dt>Error</dt><dd>${c.error_type || "—"}</dd>
        </dl>
        ${c.narrative ? `<div class="quote">${c.narrative}</div>` : ""}`;
    };
  });
}

async function runLive(forceConfess = false) {
  const threshold = Number($("#threshold").value);
  const scenario = ui.armed || forceConfess ? "conflict" : "aligned";
  const body = { symbol: ui.symbol, threshold, scenario, force: forceConfess };
  setPipe("Reading…", "—", "—");
  $("#hint").textContent = "Running live agent cycle…";
  const result = await api("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  renderResultFromLive(result);
  await refreshState();
  $("#hint").textContent = "Cycle complete. Run again to test refuse, or switch domain.";
}

function runFixture() {
  const D = DOMAINS[ui.domain];
  const key = `${ui.domain}/${ui.symbol}`;
  const mem = loadFixtureMem()[key];
  const conflict = ui.armed;
  const vals = conflict ? D.conflict : D.aligned;
  renderFixtureResult(D, vals, conflict, mem);
  if (conflict && !mem) {
    // auto-write fixture rule on first conflict (matches product story)
    const store = loadFixtureMem();
    const id = `c_fix_${Date.now().toString(36)}`;
    const rule = `${D.prefix}-001`;
    store[key] = {
      id,
      rule,
      text: `If sources conflict on ${ui.symbol} ${D.metric}, refuse and cite ${id}.`,
    };
    saveFixtureMem(store);
    $("#hint").textContent = "Fixture confession stored. Run again with Force conflict on to see refuse.";
  } else if (conflict && mem) {
    $("#hint").textContent = "Refused under fixture rule.";
  } else {
    $("#hint").textContent = "Aligned fixture. Turn on Force conflict to test confession.";
  }
}

async function onRun(forceConfess = false) {
  if (ui.busy) return;
  ui.busy = true;
  $("#error").hidden = true;
  $("#run").disabled = true;
  try {
    if (isLiveSymbol(ui.domain, ui.symbol)) await runLive(forceConfess);
    else runFixture();
  } catch (e) {
    $("#error").hidden = false;
    $("#error").textContent = e.message;
  } finally {
    ui.busy = false;
    $("#run").disabled = false;
  }
}

function wire() {
  $("#domain").onchange = (e) => {
    ui.domain = e.target.value;
    ui.symbol = DOMAINS[ui.domain].symbols[0];
    fillDomainUI();
  };
  $("#symbol").onchange = (e) => {
    ui.symbol = e.target.value;
    updateTitle();
  };
  $("#run").onclick = () => onRun(false);
  $("#force-confess").onclick = () => onRun(true);
  $("#force").onclick = () => {
    ui.armed = !ui.armed;
    $("#force").textContent = ui.armed ? "Force conflict: on" : "Force conflict: off";
    $("#force").classList.toggle("on", ui.armed);
  };
  $("#reset").onclick = async () => {
    try {
      await api("/api/reset", { method: "POST" });
    } catch {
      /* */
    }
    localStorage.removeItem(STORE);
    $("#result").innerHTML = "";
    setPipe("Waiting", "Waiting", "Waiting");
    await refreshState();
    $("#hint").textContent = "Memory cleared.";
  };
  $("#nav-run").onclick = () => {
    ui.view = "run";
    $("#view-run").hidden = false;
    $("#view-ledger").hidden = true;
    $("#nav-run").classList.add("on");
    $("#nav-ledger").classList.remove("on");
  };
  $("#nav-ledger").onclick = () => {
    ui.view = "ledger";
    $("#view-run").hidden = true;
    $("#view-ledger").hidden = false;
    $("#nav-ledger").classList.add("on");
    $("#nav-run").classList.remove("on");
    renderLedger();
  };
}

wire();
refreshState();
