const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== undefined && kid !== null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const pct = (n) => (n === null || n === undefined ? "n/a" : `${n.toFixed(2)}%`);
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour12: false });
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const pretty = (s) => s.replace(/_/g, " ");

let appState = null;

/* ---------- header status ---------- */
function renderStatus(s) {
  const p = s.providers;
  const item = (name, value, tone) => el("span", { class: "pv" }, el("span", { class: `dot ${tone}` }), el("span", { class: "k", text: name }), el("span", { text: value }));
  const nav = $("#status");
  nav.replaceChildren(
    el("span", { class: "modechip", text: s.mode.sample ? "SAMPLE_MODE" : "LIVE" }),
    item("Zetaris", { live: "Live", direct: "Public APIs", sample: "Fixtures" }[p.zetaris], p.zetaris === "live" ? "ok" : ""),
    item("Meterless", p.meterless === "live" ? "H-MEM live" : "Fallback", p.meterless === "live" ? "ok" : "warn"),
    item("Nightshift", p.nightshift === "live" ? "Live" : "Templates", p.nightshift === "live" ? "ok" : ""),
  );
  $("#scenario-field").hidden = !s.mode.sample;
  $("#demo-note").hidden = !s.mode.sample;
}

/* ---------- side lists ---------- */
function renderRules(rules) {
  $("#rules-count").textContent = rules.length ? `${rules.length} active` : "Append only";
  const box = $("#rules");
  if (!rules.length) return box.replaceChildren(el("div", { class: "none", text: "No rules yet. The first failed claim creates one." }));
  box.replaceChildren(
    ...rules.map((r) =>
      el("div", { class: "item" },
        el("div", { class: "top-line" }, el("span", { class: "id", text: r.rule_id }), el("span", { class: "meta", text: `${r.shape.symbol} 24h change` })),
        el("p", { text: r.rule_text }),
        el("p", { class: "cite", text: `cites ${r.confession_id}` }),
      ),
    ),
  );
}

async function showLedger(memoryId, holder, button) {
  button.disabled = true;
  try {
    const lines = await api(`/api/audit/${encodeURIComponent(memoryId)}`);
    holder.replaceChildren(
      lines.length
        ? el("ul", { class: "ledger" }, lines.map((l) => el("li", { text: `${clock(l.at)}  ${l.action}${l.detail ? `  ${l.detail}` : ""}` })))
        : el("p", { class: "meta", text: "No ledger entries." }),
    );
  } catch (e) {
    holder.replaceChildren(el("p", { class: "error", text: e.message }));
  }
  button.disabled = false;
}

function renderConfessions(list) {
  $("#conf-count").textContent = list.length ? `${list.length} on record` : "";
  const box = $("#confessions");
  if (!list.length) return box.replaceChildren(el("div", { class: "none", text: "Nothing confessed yet." }));
  box.replaceChildren(
    ...list.map((c) => {
      const holder = el("div");
      const btn = el("button", { class: "mini", type: "button", text: `Ledger ${c.memory_id}` });
      btn.addEventListener("click", () => showLedger(c.memory_id, holder, btn));
      return el("div", { class: "item" },
        el("div", { class: "top-line" }, el("span", { class: "id", text: c.confession_id }), el("span", { class: "meta", text: pretty(c.error_type) })),
        el("p", { text: c.claim }),
        el("p", { class: "cite", text: `${c.rule_id} · ${when(c.created_at)}` }),
        el("details", {}, el("summary", { text: "Confession" }), el("p", { class: "quote", text: c.narrative }), btn, holder),
      );
    }),
  );
}

/* ---------- trace ---------- */
function renderTrace(events) {
  const t = $("#trace");
  if (!events.length) return t.replaceChildren(el("tbody", {}, el("tr", {}, el("td", { class: "mono", text: "No events yet." }))));
  t.replaceChildren(
    el("thead", {}, el("tr", {}, ["Time", "Handoff", "Event", "Detail"].map((h) => el("th", { text: h })))),
    el("tbody", {}, [...events].reverse().map((e) =>
      el("tr", {}, el("td", { class: "mono", text: clock(e.ts) }), el("td", { class: "mono", text: `${e.from} → ${e.to}` }), el("td", { class: "mono", text: e.type }), el("td", { text: e.summary })),
    )),
  );
}

/* ---------- result ---------- */
function setStep(name, cls, text) {
  const li = $(`#pipeline [data-step="${name}"]`);
  li.className = cls;
  $(".step-state", li).textContent = text;
}

function resetPipeline() {
  for (const n of ["aggregate", "claim", "confess"]) setStep(n, "", "Waiting");
}

function sourcesBlock(b, threshold) {
  const vals = b.readings.map((r) => r.value).filter((v) => v !== null);
  const scale = Math.max(1, threshold, ...vals.map((v) => Math.abs(v))) * 1.15;
  const rows = b.readings.map((r) => {
    const ok = r.value !== null;
    const above = ok && r.value > threshold;
    const bar = el("div", { class: "bar" },
      ok && r.value > 0 ? el("i", { class: above ? "" : "below", style: `width:${Math.min(100, (r.value / scale) * 100)}%` }) : null,
      threshold > 0 ? el("b", { style: `left:${Math.min(100, (threshold / scale) * 100)}%` }) : null,
    );
    return el("tr", {},
      el("td", { class: "mono", text: r.source }),
      el("td", { class: "num", text: ok ? pct(r.value) : "n/a" }),
      el("td", {}, bar),
      el("td", { text: ok ? (above ? "Above claim" : "At or below claim") : r.error || "No reading" }),
    );
  });
  const via = { fixture: "Sample fixtures", zetaris: "Zetaris query", direct: "Public APIs" }[b.via];
  return el("section", {},
    el("div", { class: "block-title" }, el("span", { text: "Sources" }), el("span", { class: "hint", text: `Claim line at ${threshold}%` })),
    el("div", { class: "scroll" }, el("table", { class: "table sources" },
      el("thead", {}, el("tr", {}, ["Source", "24h change", "Against claim", ""].map((h) => el("th", { text: h })))),
      el("tbody", {}, rows),
    )),
    el("div", { class: "summary" },
      el("span", {}, "Status ", el("span", { class: `tag ${b.status}`, text: b.status })),
      el("span", {}, "Spread ", el("b", { text: b.spread === null ? "n/a" : `${b.spread} pp` })),
      el("span", {}, "Tolerance ", el("b", { text: `${b.tolerance} pp` })),
      el("span", {}, "Consensus ", el("b", { text: pct(b.consensus) })),
      el("span", {}, "Via ", el("b", { text: via })),
    ),
    b.query ? el("p", { class: "note mono-text", text: b.query }) : null,
  );
}

function claimBlock(c) {
  return el("section", {},
    el("div", { class: "block-title" }, el("span", { text: "Claim" }), el("span", { class: "hint", text: c.author === "nightshift" ? "Written via Nightshift" : "Template text" })),
    el("div", { class: "card" },
      el("dl", { class: "kv" },
        el("dt", { text: "Statement" }), el("dd", { text: c.text }),
        el("dt", { text: "Confidence" }), el("dd", {}, el("div", { class: "meter" }, el("div", { class: "bar" }, el("i", { style: `width:${c.confidence * 100}%` })), el("span", { class: "mono-text", text: c.confidence.toFixed(2) }))),
      ),
      el("p", { text: c.rationale }),
    ),
  );
}

function confessionBlock(c, r) {
  return el("section", {},
    el("div", { class: "block-title" }, el("span", { text: "Confession" }), el("span", { class: "hint", text: c.narrative_author === "nightshift" ? "Written via Nightshift" : "Template text" })),
    el("div", { class: "card" },
      el("dl", { class: "kv" },
        el("dt", { text: "Record" }), el("dd", { class: "mono-text", text: c.confession_id }),
        el("dt", { text: "Error type" }), el("dd", { text: pretty(c.error_type) }),
        el("dt", { text: "Rule issued" }), el("dd", {}, el("span", { class: "mono-text", text: r.rule_id }), ` — ${r.rule_text}`),
        el("dt", { text: "Stored as" }), el("dd", { class: "mono-text", text: `${c.memory_id} in Meterless H-MEM` }),
        el("dt", { text: "Next action" }), el("dd", { text: c.next_action }),
      ),
      el("p", { class: "quote", text: c.narrative }),
    ),
  );
}

function refusalBlock(m) {
  const c = m.confession;
  const hits = m.recall.hits;
  return el("section", {},
    el("div", { class: "block-title" }, el("span", { text: "Citation" }), el("span", { class: "hint", text: `Recall: ${m.recall.strategy}` })),
    el("div", { class: "card" },
      el("dl", { class: "kv" },
        el("dt", { text: "Rule" }), el("dd", {}, el("span", { class: "mono-text", text: m.rule.rule_id }), ` — ${m.rule.rule_text}`),
        el("dt", { text: "Confession" }), el("dd", { class: "mono-text", text: m.rule.confession_id }),
        c ? [el("dt", { text: "Filed" }), el("dd", { text: when(c.created_at) })] : null,
        el("dt", { text: "Recalled" }), el("dd", { class: "mono-text", text: hits.length ? hits.map((h) => `${h.id} (${h.relevance})`).join(", ") : "none" }),
      ),
      c ? el("p", { class: "quote", text: c.narrative }) : null,
    ),
  );
}

function renderResult(r) {
  const b = r.bundle;
  let head;
  if (r.decision === "refuse") head = { word: "Refused", why: `${r.refusal.rule.rule_id} blocked this claim before it was made, citing ${r.refusal.rule.confession_id}.` };
  else if (r.decision === "stands") head = { word: "Claim stands", why: r.claim.rationale };
  else head = { word: "Confessed", why: `The claim failed. ${r.rule.rule_id} now blocks the same pattern.` };

  $("#result").replaceChildren(...[
    el("div", { class: `verdict ${r.decision}` },
      el("div", { class: "label", text: "Decision" }),
      el("div", { class: "verdict-word", text: head.word }),
      el("p", { class: "verdict-claim", text: r.proposed }),
      el("p", { class: "verdict-why", text: head.why }),
    ),
    sourcesBlock(b, r.threshold),
    r.claim ? claimBlock(r.claim) : null,
    r.confession ? confessionBlock(r.confession, r.rule) : null,
    r.refusal ? refusalBlock(r.refusal) : null,
  ].filter(Boolean));

  setStep("aggregate", "done", `${b.status}, spread ${b.spread === null ? "n/a" : `${b.spread} pp`}`);
  if (r.decision === "refuse") {
    setStep("claim", "skip", "Skipped");
    setStep("confess", "alert", `Refused under ${r.refusal.rule.rule_id}`);
  } else if (r.decision === "stands") {
    setStep("claim", "done", `Confidence ${r.claim.confidence.toFixed(2)}`);
    setStep("confess", "skip", "Not needed");
  } else {
    setStep("claim", "done", `Confidence ${r.claim.confidence.toFixed(2)}`);
    setStep("confess", "alert", `${r.rule.rule_id} issued`);
  }
}

/* ---------- actions ---------- */
function showError(msg) {
  const e = $("#error");
  e.hidden = !msg;
  e.textContent = msg || "";
}

async function refresh() {
  appState = await api("/api/state");
  renderStatus(appState);
  renderRules(appState.rules);
  renderConfessions(appState.confessions);
  renderTrace(await api("/api/trace"));
}

async function run(force) {
  const buttons = [$("#run"), $("#force")];
  buttons.forEach((b) => (b.disabled = true));
  $("#run").textContent = "Running";
  showError("");
  resetPipeline();
  try {
    const threshold = $("#threshold").value;
    const body = {
      symbol: $('input[name="asset"]:checked').value,
      threshold: threshold === "" ? undefined : Number(threshold),
      scenario: $('input[name="scenario"]:checked').value,
      force,
    };
    const result = await api("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    renderResult(result);
    await refresh();
  } catch (e) {
    showError(e.message);
  } finally {
    $("#run").textContent = "Run cycle";
    buttons.forEach((b) => (b.disabled = false));
  }
}

$("#run").addEventListener("click", () => run(false));
$("#force").addEventListener("click", () => run(true));
document.querySelectorAll('input[name="asset"]').forEach((r) =>
  r.addEventListener("change", () => ($("#threshold").value = r.value === "BTC" ? "5" : "3")),
);
$("#reset").addEventListener("click", async () => {
  if (!confirm("Clear all confessions, rules, memory and the trace log?")) return;
  try {
    await api("/api/reset", { method: "POST" });
    $("#result").replaceChildren(el("div", { class: "empty", text: "Memory cleared. Run a cycle to start again." }));
    resetPipeline();
    await refresh();
  } catch (e) {
    showError(e.message);
  }
});

refresh().catch((e) => showError(e.message));
