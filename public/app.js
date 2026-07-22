import { api } from "./api.js";
import { escapeHtml, qs, qsa, toast, formToObject } from "./dom.js";
const app = () => qs("#app");
function renderLineChartSVG(labels, series, opts) {
    const width = 640;
    const height = 220;
    const padLeft = 52;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const allValues = series.flatMap((s) => s.values).filter((v) => v != null);
    const maxRaw = allValues.length ? Math.max(...allValues) : 1;
    const max = maxRaw <= 0 ? 1 : maxRaw * 1.15;
    const n = labels.length;
    const xStep = n > 1 ? plotW / (n - 1) : 0;
    const xAt = (i) => padLeft + xStep * i;
    const yAt = (v) => padTop + plotH * (1 - v / max);
    const gridLines = 4;
    const gridSvg = Array.from({ length: gridLines + 1 }, (_, i) => {
        const frac = i / gridLines;
        const y = padTop + plotH * (1 - frac);
        const val = max * frac;
        return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--border)" stroke-width="1" />
      <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${val >= 100 ? Math.round(val) : val.toFixed(1)}</text>`;
    }).join("");
    // Thin out x-axis labels once there are more than ~8 months, so they don't collide.
    const labelStride = n > 8 ? Math.ceil(n / 8) : 1;
    const xLabelsSvg = labels
        .map((l, i) => (i % labelStride === 0 ? `<text x="${xAt(i)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${escapeHtml(l)}</text>` : ""))
        .join("");
    const seriesSvg = series
        .map((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : { x: xAt(i), y: yAt(v) }));
        // Break the polyline across null (missing-data) points rather than interpolating through them.
        const segments = [];
        let cur = [];
        for (const p of pts) {
            if (p == null) {
                if (cur.length)
                    segments.push(cur);
                cur = [];
            }
            else {
                cur.push(p);
            }
        }
        if (cur.length)
            segments.push(cur);
        const pathSvg = segments
            .map((seg) => `<polyline points="${seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`)
            .join("");
        const markersSvg = pts
            .map((p, i) => {
            if (p == null)
                return "";
            const label = s.values[i];
            return `<g><circle cx="${p.x}" cy="${p.y}" r="8" fill="transparent"><title>${escapeHtml(labels[i])} — ${escapeHtml(s.name)}: ${label.toFixed(2)}${opts?.unit ? " " + opts.unit : ""}</title></circle><circle cx="${p.x}" cy="${p.y}" r="3" fill="${s.color}" /></g>`;
        })
            .join("");
        // Direct end-of-line label — neutral ink, not series color (the legend swatch carries identity).
        const lastIdx = [...pts].reverse().findIndex((p) => p != null);
        const lastPt = lastIdx >= 0 ? pts[pts.length - 1 - lastIdx] : null;
        const lastVal = lastIdx >= 0 ? s.values[pts.length - 1 - lastIdx] : null;
        const endLabelSvg = lastPt && lastVal != null
            ? `<text x="${Math.min(lastPt.x + 6, width - padRight)}" y="${lastPt.y - 6}" font-size="10" fill="var(--text)" text-anchor="${lastPt.x + 6 > width - padRight - 30 ? "end" : "start"}">${lastVal.toFixed(1)}</text>`
            : "";
        return pathSvg + markersSvg + endLabelSvg;
    })
        .join("");
    const legendSvg = series
        .map((s, i) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span><span class="muted" style="font-size:0.8rem">${escapeHtml(s.name)}</span></span>`)
        .join("");
    return `
    <div class="chart">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${series.map((s) => s.name).join(" vs ")} trend chart">
        ${gridSvg}
        ${xLabelsSvg}
        ${seriesSvg}
      </svg>
      <div class="chart__legend">${legendSvg}</div>
    </div>`;
}
// ---------------------------------------------------------------------------
// Gantt chart with critical path — post-NOC project schedule (GanttTask[] on
// DealerCase.project). Each task carries at most one `dependency` (the task
// it starts after), so the critical path is the longest-duration chain through
// that dependency graph, computed here rather than assumed — today's fixed
// 5-task sequence happens to make every task critical (there's only one chain
// to compare), but the computation holds if the schedule ever branches.
// ---------------------------------------------------------------------------
function computeCriticalPath(tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const durationDays = (t) => (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000;
    const earliestFinish = new Map();
    let changed = true;
    let guard = 0;
    while (changed && guard < tasks.length + 1) {
        changed = false;
        guard++;
        for (const t of tasks) {
            const depFinish = t.dependency ? (earliestFinish.get(t.dependency) ?? 0) : 0;
            const finish = depFinish + durationDays(t);
            if (earliestFinish.get(t.id) !== finish) {
                earliestFinish.set(t.id, finish);
                changed = true;
            }
        }
    }
    let endTask = null;
    let maxFinish = -Infinity;
    for (const t of tasks) {
        const f = earliestFinish.get(t.id) ?? 0;
        if (f > maxFinish) {
            maxFinish = f;
            endTask = t;
        }
    }
    const criticalIds = new Set();
    let cur = endTask;
    while (cur) {
        criticalIds.add(cur.id);
        cur = cur.dependency ? byId.get(cur.dependency) : null;
    }
    return { criticalIds, totalDays: Math.round(maxFinish) };
}
const GANTT_STATUS_COLOR = {
    Done: "var(--accent-2)",
    InProgress: "var(--warn)",
    Delayed: "var(--danger)",
    NotStarted: "var(--muted)",
};
function renderGanttChart(tasks) {
    if (!tasks.length)
        return `<p class="muted">No project tasks on file.</p>`;
    const { criticalIds, totalDays } = computeCriticalPath(tasks);
    const minDate = Math.min(...tasks.map((t) => new Date(t.startDate).getTime()));
    const maxDate = Math.max(...tasks.map((t) => new Date(t.endDate).getTime()));
    const totalMs = Math.max(maxDate - minDate, 86400000);
    const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const rows = tasks
        .map((t) => {
        const startMs = new Date(t.startDate).getTime();
        const endMs = new Date(t.endDate).getTime();
        const startPct = ((startMs - minDate) / totalMs) * 100;
        const widthPct = Math.max(((endMs - startMs) / totalMs) * 100, 1.5);
        const isCritical = criticalIds.has(t.id);
        const color = GANTT_STATUS_COLOR[t.status] ?? "var(--muted)";
        return `
        <div class="gantt-row">
          <div class="gantt-row__label">${escapeHtml(t.name)}${isCritical ? `<span class="badge" style="background:var(--danger);color:white;border:none">Critical</span>` : ""}</div>
          <div class="gantt-row__track">
            <div class="gantt-bar${isCritical ? " gantt-bar--critical" : ""}" style="left:${startPct}%;width:${widthPct}%;background:${color}" title="${escapeHtml(t.name)}: ${t.startDate} to ${t.endDate} (${escapeHtml(t.status)})">${escapeHtml(t.name)}</div>
          </div>
        </div>`;
    })
        .join("");
    return `
    <div class="chart">
      ${rows}
      <div class="gantt-axis"><span>${fmtDate(minDate)}</span><span>${fmtDate((minDate + maxDate) / 2)}</span><span>${fmtDate(maxDate)}</span></div>
      <div class="chart__legend">
        <span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:10px;height:10px;border-radius:2px;background:var(--muted);display:inline-block"></span><span class="muted" style="font-size:0.8rem">Not started</span></span>
        <span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:10px;height:10px;border-radius:2px;background:var(--warn);display:inline-block"></span><span class="muted" style="font-size:0.8rem">In progress</span></span>
        <span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-2);display:inline-block"></span><span class="muted" style="font-size:0.8rem">Done</span></span>
        <span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:10px;height:10px;border-radius:2px;background:var(--danger);display:inline-block"></span><span class="muted" style="font-size:0.8rem">Delayed</span></span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;border:2px solid var(--text);display:inline-block"></span><span class="muted" style="font-size:0.8rem">Critical path</span></span>
      </div>
      <p class="muted">Critical path length: <strong>${totalDays}</strong> day(s), end-to-end.</p>
    </div>`;
}
/** Resolves a TaskItem/CalendarEvent-style linkedModule+linkedRecordId pair to a hash link, if any. */
function linkedRecordHref(linkedModule, linkedRecordId) {
    if (!linkedModule || !linkedRecordId)
        return undefined;
    switch (linkedModule) {
        case "Outlet":
            return `#/outlets/${linkedRecordId}`;
        case "DealerCase":
            return `#/cases/${linkedRecordId}`;
        case "Analytics":
            return `#/analytics`;
        case "Knowledge":
            return `#/knowledge`;
        case "DealerRequest":
            return `#/dealer-desk/${linkedRecordId}`;
        default:
            return undefined;
    }
}
function taskTitleHtml(t) {
    const href = linkedRecordHref(t.linkedModule, t.linkedRecordId);
    return href ? `<a href="${href}">${escapeHtml(t.title)}</a>` : escapeHtml(t.title);
}
function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [tab, id, sub] = hash.split("/");
    return { tab: tab || "outlets", id, sub };
}
const TABS = [
    { key: "outlets", label: "1 · Outlet Repository" },
    { key: "cases", label: "2 · Dealer Selection" },
    { key: "analytics", label: "3 · Predictive Analysis" },
    { key: "teams", label: "4 · Teams Communication" },
    { key: "cockpit", label: "5 · SO Cockpit" },
    { key: "knowledge", label: "6 · Knowledge Centre" },
    { key: "dealer-desk", label: "7 · Dealer Request Desk" },
];
function renderNav(active) {
    const nav = qs("#nav");
    nav.innerHTML = TABS.map((t) => `<a href="#/${t.key}" class="nav-link${t.key === active ? " nav-link--active" : ""}">${t.label}</a>`).join("");
}
async function route() {
    const { tab, id, sub } = parseHash();
    renderNav(tab);
    try {
        switch (tab) {
            case "outlets":
                if (id && sub === "fixed-assets")
                    await renderOutletFixedAssets(id);
                else if (id)
                    await renderOutletDetail(id);
                else
                    await renderOutlets();
                break;
            case "cases":
                id ? await renderCaseDetail(id) : await renderCases();
                break;
            case "analytics":
                await renderAnalytics();
                break;
            case "teams":
                await renderTeams();
                break;
            case "cockpit":
                await renderCockpit();
                break;
            case "knowledge":
                await renderKnowledge();
                break;
            case "dealer-desk":
                id ? await renderDealerRequestDetail(id) : await renderDealerDesk();
                break;
            case "trading-areas":
                id ? await renderTradingAreaDetail(id) : await renderTradingAreasList();
                break;
            default:
                app().innerHTML = `<p>Unknown section.</p>`;
        }
    }
    catch (err) {
        app().innerHTML = `<div class="panel panel--error">${escapeHtml(err.message)}</div>`;
    }
}
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
    if (!location.hash)
        location.hash = "#/outlets";
    route();
    loadHealth();
});
async function loadHealth() {
    try {
        const health = await api.get("/health");
        qs("#ai-engine-badge").textContent = `AI engine: ${health.aiEngine}`;
    }
    catch {
        qs("#ai-engine-badge").textContent = "AI engine: unavailable";
    }
}
// ---------------------------------------------------------------------------
// Module 1 — Outlet Data Repository
// ---------------------------------------------------------------------------
async function renderOutlets() {
    const outlets = await api.get("/outlets");
    app().innerHTML = `
    <section class="panel">
      <h2>Outlet Data Repository</h2>
      <p class="muted">Standard data + scanned communications, per outlet. Click an outlet for its one-pager.</p>

      <h3>Input Tap <span class="muted">(upload a real sales or tank-stock snapshot — no code change needed)</span></h3>
      <p class="muted">
        Sales snapshot columns: <code>SAP Code, Date, MS (KL), HSD (KL)</code>. Tank-stock snapshot columns:
        <code>SAP Code, Product, Stock Date, Capacity (Ltr), Stock Qty (Ltr), Pumpable Stock (Ltr), Ullage (Ltr)</code>.
        Accepts .xlsx or .csv. Takes effect immediately and is saved to disk so it survives a restart.
      </p>
      <div class="form--inline">
        <label>Sales snapshot <input id="upload-sales-file" type="file" accept=".xlsx,.csv" /></label>
        <label>Stock snapshot <input id="upload-stock-file" type="file" accept=".xlsx,.csv" /></label>
        <label>Transaction report (DU log) <input id="upload-transactions-file" type="file" accept=".xlsx" /></label>
      </div>
      <div id="upload-result" class="muted"></div>

      <form id="outlet-jump-form" class="form--inline">
        <label>Jump to outlet
          <select name="outletId" id="outlet-jump-select">
            <option value="">Select an outlet…</option>
            ${outlets.map((o) => `<option value="${o.id}">${escapeHtml(o.name)} — ${escapeHtml(o.salesArea)}</option>`).join("")}
          </select>
        </label>
        <button type="submit" class="btn btn--sm">Go</button>
      </form>

      <div class="grid-cards">
        ${outlets
        .map((o) => `
          <a class="card" href="#/outlets/${o.id}">
            <h3>${escapeHtml(o.name)}</h3>
            <p>${escapeHtml(o.salesArea)} · ${escapeHtml(o.status)}</p>
            <p class="muted">${escapeHtml(o.dealerName ?? "No dealer on record")}</p>
            <p>${o.canopy ? "🏗 Canopy" : ""} ${o.nozzleSalesStarted ? "⛽ Nozzle sales started" : ""}</p>
          </a>`)
        .join("")}
      </div>
    </section>`;
    qs("#outlet-jump-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const id = qs("#outlet-jump-select").value;
        if (id)
            location.hash = `#/outlets/${id}`;
    });
    wireDataUploadInput("#upload-sales-file", "/data-uploads/sales");
    wireDataUploadInput("#upload-stock-file", "/data-uploads/stock");
    wireDataUploadInput("#upload-transactions-file", "/data-uploads/transactions");
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
function wireDataUploadInput(selector, endpoint) {
    const input = document.querySelector(selector);
    if (!input)
        return;
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file)
            return;
        const resultEl = document.querySelector("#upload-result");
        try {
            const base64 = await fileToBase64(file);
            const result = await api.post(endpoint, { fileName: file.name, base64 });
            const msg = `"${file.name}": ${result.rowsApplied}/${result.rowsRead} row(s) applied.${result.warnings.length ? ` ${result.warnings.length} warning(s): ${result.warnings.slice(0, 5).join(" ")}` : ""}`;
            if (resultEl)
                resultEl.innerHTML = `<p>${escapeHtml(msg)}</p>`;
            toast(`Upload applied: ${result.rowsApplied} row(s)`);
        }
        catch (err) {
            if (resultEl)
                resultEl.innerHTML = `<p>Upload failed: ${escapeHtml(err.message)}</p>`;
            toast("Upload failed");
        }
        finally {
            input.value = "";
        }
    });
}
async function renderOutletDetail(id) {
    const [report, dataNotes] = await Promise.all([api.get(`/outlets/${id}/report`), api.get(`/outlets/${id}/data-input`)]);
    const o = report.outlet;
    app().innerHTML = `
    <section class="panel">
      <a href="#/outlets">&larr; All outlets</a>
      <h2>${escapeHtml(o.name)}</h2>
      <p>${escapeHtml(o.salesArea)} · ${escapeHtml(o.district)} · ${escapeHtml(o.status)} · Dealer: ${escapeHtml(o.dealerName ?? "-")}</p>
      ${report.tradingArea
        ? `<p>Trading Area: <a href="#/trading-areas/${report.tradingArea.id}">${escapeHtml(report.tradingArea.name)}</a></p>`
        : ""}
      <p><a class="btn" href="/api/outlets/${o.id}/report.pdf" target="_blank">⬇ Download one-pager PDF</a></p>

      <h3>Master Sheet</h3>
      <table class="table">
        <tbody>
          ${report.masterSheetTable.map((r) => `<tr><th>${escapeHtml(r.field)}</th><td>${escapeHtml(r.value)}</td></tr>`).join("") || "<tr><td>No master sheet fields on file.</td></tr>"}
        </tbody>
      </table>

      <h3>Fixed Assets</h3>
      ${report.fixedAssetSummary.count
        ? `<p>
        Total Invested: <strong>Rs. ${report.fixedAssetSummary.totalInvested.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Total Depreciation: <strong>Rs. ${report.fixedAssetSummary.totalDepreciation.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Net Book Value: <strong>Rs. ${report.fixedAssetSummary.totalNetBookValue.toLocaleString("en-IN")}</strong>
        &nbsp;(${report.fixedAssetSummary.count} item(s))
      </p>`
        : `<p class="muted">No fixed-asset ledger (SAP FAIL) on file for this outlet yet — not a data error, just no ledger export loaded for this SAP code.</p>`}
      <p><a class="btn btn--sm" href="#/outlets/${o.id}/fixed-assets">View itemised fixed asset report &rarr;</a></p>

      <h3>Sales snapshot (Module 3 link)</h3>
      <p>30-day throughput: <strong>${report.last30DaysKL} KL</strong> &nbsp;|&nbsp; Dry days (60-day): <strong>${report.dryDaysLast60}</strong></p>
      ${report.tankStock.length
        ? `<h4>Tank stock <span class="muted">(live SAP feed, ${escapeHtml(report.tankStock[0].stockDate)})</span></h4>
          <table class="table"><thead><tr><th>Product</th><th>Capacity (L)</th><th>Stock (L)</th><th>Pumpable (L)</th><th>Ullage (L)</th><th>% full</th></tr></thead>
          <tbody>${report.tankStock
            .map((t) => `<tr><td>${escapeHtml(t.product)}</td><td>${t.capacityLtr.toLocaleString("en-IN")}</td><td>${t.stockQtyLtr.toLocaleString("en-IN")}</td><td>${t.pumpableStockLtr.toLocaleString("en-IN")}</td><td>${t.ullageLtr.toLocaleString("en-IN")}</td><td>${t.capacityLtr ? ((t.stockQtyLtr / t.capacityLtr) * 100).toFixed(1) : "0"}%${t.pumpableStockLtr <= 0 ? " ⚠️ dry" : ""}</td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="muted">No live tank-stock feed for this outlet.</p>`}

      <h3>Traffic pattern &amp; DU status <span class="muted">(real DU transaction log)</span></h3>
      ${renderTrafficSection(report.traffic)}

      <h3>Product-wise LY vs CY comparison <span class="muted">(real DSR data — last FY vs current FY to date)</span></h3>
      ${renderProductComparisonSection(o.productComparison)}

      <h3>Power vs MS trend <span class="muted">(real monthly DSR data)</span></h3>
      ${renderPowerVsMsSection(o.productComparison, report.traffic)}

      ${report.linkedCase
        ? `<h3>Linked Dealer Case (Module 2)</h3><p><a href="#/cases/${report.linkedCase.id}">${report.linkedCase.id}</a> — stage: ${escapeHtml(report.linkedCase.stage)}</p>`
        : ""}

      <h3>Dealer requests <span class="muted">(Module 7 link)</span></h3>
      ${report.dealerRequests.length
        ? `<ul>${report.dealerRequests
            .map((r) => `<li><span class="badge badge--${r.criticality.toLowerCase()}">${escapeHtml(r.criticality)}</span> <a href="#/dealer-desk/${r.id}">${escapeHtml(r.category)} — ${escapeHtml(r.subject)}</a> (${escapeHtml(r.status)})</li>`)
            .join("")}</ul>`
        : `<p class="muted">No requests raised for this outlet.</p>`}
      <p><a class="btn btn--sm" href="#/dealer-desk">Raise or view dealer requests &rarr;</a></p>

      <h3>Communications on file</h3>
      <table class="table">
        <thead><tr><th>Date</th><th>Direction</th><th>Channel</th><th>Subject</th><th></th></tr></thead>
        <tbody>
          ${report.communications
        .map((c) => `<tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.direction)}</td><td>${escapeHtml(c.channel)}${c.scanCopy ? " (scan)" : ""}</td><td>${escapeHtml(c.subject)}</td><td><a href="/api/outlets/${o.id}/communications/${c.id}/pdf" target="_blank">PDF</a></td></tr>`)
        .join("") || "<tr><td colspan='5'>No communications on file.</td></tr>"}
        </tbody>
      </table>

      <h3>Log a new communication</h3>
      <form id="comm-form" class="form">
        <label>Direction
          <select name="direction"><option>Inbound</option><option>Outbound</option></select>
        </label>
        <label>Channel
          <select name="channel"><option>Email</option><option>Letter</option><option>Notice</option><option>Scan</option></select>
        </label>
        <label>Subject <input name="subject" required /></label>
        <label>Summary <textarea name="summary" required></textarea></label>
        <label><input type="checkbox" name="scanCopy" /> This is a scanned copy of a physical communication</label>
        <button type="submit" class="btn">Save communication</button>
      </form>

      <h3>Action Points / Minutes of Meeting</h3>
      ${renderActionPointsSection(report.actionPoints)}
      <form id="action-point-form" class="form">
        <label>Raised by <input name="raisedBy" required /></label>
        <label>Title <input name="title" required /></label>
        <label>Notes / minutes <textarea name="notes"></textarea></label>
        <label>Action required <input name="actionRequired" /></label>
        <label>Owner <input name="owner" /></label>
        <label>Due date <input name="dueDate" type="date" /></label>
        <button type="submit" class="btn btn--sm">Add action point</button>
      </form>

      <h3>Data Input <span class="muted">(keep feeding real updates — one fact per line, no code change needed)</span></h3>
      <p class="muted">
        Recognised fields apply straight to the outlet: <code>Status:</code>, <code>Dealer Name:</code>, <code>Canopy:</code> (yes/no),
        <code>Nozzle Sales Started:</code> (yes/no), <code>TA Average KL:</code>. Any other <code>Key: Value</code> line is merged into the
        Master Sheet above. Anything else is kept verbatim as a note — nothing is ever guessed or dropped.
      </p>
      <form id="data-input-form" class="form">
        <label>Paste/type updates <textarea name="text" rows="4" placeholder="Status: Operational&#10;Dealer Name: New Dealer Pvt Ltd&#10;TA Average KL: 620&#10;Site visited 20-Jul, dealer requested extra signage"></textarea></label>
        <button type="submit" class="btn btn--sm">Analyse &amp; apply</button>
      </form>
      <div id="data-input-result"></div>
      ${renderDataInputNotes(dataNotes)}

      ${renderModernisationSection(o.id, o.status, report.modernisationRequests)}
    </section>`;
    qs("#comm-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = formToObject(form);
        await api.post(`/outlets/${o.id}/communications`, {
            direction: data["direction"],
            channel: data["channel"],
            subject: data["subject"],
            summary: data["summary"],
            scanCopy: form.querySelector('[name="scanCopy"]').checked,
        });
        toast("Communication saved");
        await renderOutletDetail(id);
    });
    qs("#action-point-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = formToObject(form);
        if (!data.actionRequired)
            delete data.actionRequired;
        if (!data.owner)
            delete data.owner;
        if (!data.dueDate)
            delete data.dueDate;
        await api.post(`/outlets/${o.id}/action-points`, data);
        toast("Action point added");
        await renderOutletDetail(id);
    });
    qsa(".action-point-status").forEach((el) => el.addEventListener("change", async (e) => {
        const select = e.target;
        const apId = select.dataset["apId"];
        await api.put(`/outlets/${o.id}/action-points/${apId}`, { status: select.value });
        toast("Status updated");
        await renderOutletDetail(id);
    }));
    qs("#data-input-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = formToObject(form);
        try {
            await api.post(`/outlets/${o.id}/data-input`, { text: data["text"] });
            toast("Data applied");
            await renderOutletDetail(id);
        }
        catch (err) {
            qs("#data-input-result").innerHTML = `<p class="warn">${escapeHtml(err.message)}</p>`;
        }
    });
    wireOutletModernisationHandlers(o.id, report.modernisationRequests);
}
function renderTrafficSection(traffic) {
    if (!traffic) {
        return `<p class="muted">No DU transaction data uploaded for this outlet yet — upload one via the Input Tap on the Outlet Repository page.</p>`;
    }
    const vt = traffic.vehicleTypeAverages;
    const vtLabels = { TwoWheeler: "Two-Wheeler", FourWheeler: "Four-Wheeler", HMV: "HMV", BowserSupply: "Bowser supply" };
    const inactive = traffic.nozzles.filter((n) => n.possiblyInactive);
    return `
    <p class="muted">${traffic.daysOnFile} day(s) of real transaction data on file — averages below are per day over the last ${traffic.avgWindowDays} day(s).</p>
    <table class="table">
      <thead><tr><th>Vehicle type</th><th>Avg transactions/day</th><th>Avg volume (KL)/day</th><th>Avg amount (Rs.)/day</th></tr></thead>
      <tbody>
        ${Object.keys(vt)
        .map((k) => `<tr><td>${vtLabels[k] ?? k}</td><td>${vt[k].transactions.toFixed(1)}</td><td>${vt[k].volumeKL.toFixed(2)}</td><td>${Math.round(vt[k].amountRs).toLocaleString("en-IN")}</td></tr>`)
        .join("")}
      </tbody>
    </table>
    ${traffic.peakHour
        ? `<p>Peak hour: <strong>${traffic.peakHour.hour}:00-${traffic.peakHour.hour + 1}:00</strong> (${traffic.peakHour.transactions} transactions)</p>`
        : ""}
    <h4>DU (dispensing unit) status</h4>
    <table class="table">
      <thead><tr><th>Pump</th><th>Nozzle</th><th>Transactions</th><th>Last transaction</th><th>Status</th></tr></thead>
      <tbody>
        ${traffic.nozzles
        .map((n) => `<tr><td>${escapeHtml(n.pumpNo)}</td><td>${escapeHtml(n.nozzleNo)}</td><td>${n.transactionCount}</td><td>${n.lastTransactionAt.slice(0, 10)}</td><td>${n.possiblyInactive ? '<span class="badge badge--escalated">Possibly inactive</span>' : '<span class="badge badge--resolved">Active</span>'}</td></tr>`)
        .join("")}
      </tbody>
    </table>
    ${inactive.length ? `<p class="warn">⚠️ ${inactive.length} DU(s) look inactive — verify if genuinely down.</p>` : ""}
    ${renderSlabTrendSection(traffic.slabTrend, traffic.slabTrendNarrative)}
  `;
}
/**
 * Month-wise transaction-amount "slab" (vehicle-type) volumes over the outlet's whole transaction
 * log, plus a rule-based (not AI-narrated) read on whether each slab is trending up or down —
 * every number traces back to services/trafficAnalytics.ts's monthlySlabTrend/slabTrendNarrative.
 */
function renderSlabTrendSection(rows, narrative) {
    if (!rows || rows.length < 2)
        return "";
    const vtLabels = { TwoWheeler: "Two-Wheeler", FourWheeler: "Four-Wheeler", HMV: "HMV", BowserSupply: "Bowser supply" };
    const vtKeys = Object.keys(vtLabels);
    return `
    <h4>Slab-wise volume trend <span class="muted">(month-wise, real transaction log — last month may be partial)</span></h4>
    <table class="table">
      <thead><tr><th>Month</th><th>Days on file</th>${vtKeys.map((k) => `<th>${vtLabels[k]} (avg txns/day)</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
        .map((r) => `<tr><td>${monthShortLabel(r.month)}</td><td>${r.daysOnFile}</td>${vtKeys
        .map((k) => `<td>${r.avgPerDay[k].transactions.toFixed(1)}</td>`)
        .join("")}</tr>`)
        .join("")}
      </tbody>
    </table>
    <div class="ai-output">${narrative.map(escapeHtml).join("\n")}</div>
  `;
}
const PRODUCT_COMPARISON_LABELS = [
    { key: "ms", label: "MS (Petrol)", unit: "KL" },
    { key: "hsd", label: "HSD (Diesel)", unit: "KL" },
    { key: "lube", label: "Lube", unit: "KL" },
    { key: "power", label: "Power", unit: "units" },
    { key: "def", label: "DEF", unit: "KL" },
];
function monthShortLabel(m) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
}
function renderProductComparisonSection(pc) {
    if (!pc)
        return `<p class="muted">No real DSR product-comparison data on file for this outlet.</p>`;
    const tables = PRODUCT_COMPARISON_LABELS.map(({ key, label, unit }) => {
        const series = pc[key];
        if (!series || (!series.ly.length && !series.cy.length))
            return "";
        const n = Math.max(series.ly.length, series.cy.length);
        // "YTD" totals only sum LY over the same months CY has actually reached — comparing a
        // full 12-month LY total against a partial CY-to-date total would be a like-for-unlike mismatch.
        let lyYtdTotal = 0;
        let cyTotal = 0;
        const rows = [];
        for (let i = 0; i < n; i++) {
            const ly = series.ly[i];
            const cy = series.cy[i];
            const monthKey = ly?.month ?? cy?.month;
            const lyVal = ly?.value ?? null;
            const cyVal = cy?.value ?? null;
            if (cyVal != null) {
                cyTotal += cyVal;
                if (lyVal != null)
                    lyYtdTotal += lyVal;
            }
            const growth = lyVal != null && cyVal != null && lyVal > 0 ? `${(((cyVal - lyVal) / lyVal) * 100).toFixed(1)}%` : "-";
            rows.push(`<tr><td>${monthKey ? monthShortLabel(monthKey) : "-"}</td><td>${lyVal != null ? lyVal.toFixed(2) : "-"}</td><td>${cyVal != null ? cyVal.toFixed(2) : "-"}</td><td>${growth}</td></tr>`);
        }
        const growthTotal = lyYtdTotal > 0 && cyTotal > 0 ? `${(((cyTotal - lyYtdTotal) / lyYtdTotal) * 100).toFixed(1)}%` : "-";
        const chartLabels = [];
        const lyValues = [];
        const cyValues = [];
        for (let i = 0; i < n; i++) {
            chartLabels.push(monthShortLabel(series.ly[i]?.month ?? series.cy[i]?.month ?? ""));
            lyValues.push(series.ly[i]?.value ?? null);
            cyValues.push(series.cy[i]?.value ?? null);
        }
        return `
      <h4>${escapeHtml(label)} <span class="muted">(${unit})</span></h4>
      ${renderLineChartSVG(chartLabels, [
            { name: "LY (target)", color: "#eb6834", values: lyValues },
            { name: "CY (achieved)", color: "#0057a8", values: cyValues },
        ], { unit })}
      <table class="table">
        <thead><tr><th>Month</th><th>LY (target)</th><th>CY (achieved)</th><th>Growth</th></tr></thead>
        <tbody>
          ${rows.join("")}
          <tr><td><strong>YoY (to date)</strong></td><td><strong>${lyYtdTotal.toFixed(2)}</strong></td><td><strong>${cyTotal.toFixed(2)}</strong></td><td><strong>${growthTotal}</strong></td></tr>
        </tbody>
      </table>`;
    }).filter(Boolean);
    return tables.join("") || `<p class="muted">No real DSR product-comparison data on file for this outlet.</p>`;
}
/**
 * Power (units) and MS (KL) are different measurement bases, so plotting their raw figures on one
 * shared axis would squash whichever has the smaller number — the chart below indexes each series
 * to its own real average (100 = that product's own average over the months on file) purely to
 * compare the shape of the trend; the real, un-indexed monthly figures are in the table underneath
 * so nothing is hidden behind the index. Peak-hour is real where a transaction log exists, but the
 * log only records total transactions per hour, not broken down by product — so it can't be
 * Power-specific, and the text says so rather than implying it is.
 */
function renderPowerVsMsSection(pc, traffic) {
    if (!pc?.ms || !pc?.power || (!pc.ms.ly.length && !pc.ms.cy.length) || (!pc.power.ly.length && !pc.power.cy.length)) {
        return `<p class="muted">No real DSR data on file for both MS and Power at this outlet, so no trend comparison is possible.</p>`;
    }
    const msSeries = [...pc.ms.ly, ...pc.ms.cy];
    const powerSeries = [...pc.power.ly, ...pc.power.cy];
    const n = Math.max(msSeries.length, powerSeries.length);
    const labels = [];
    const msValues = [];
    const powerValues = [];
    for (let i = 0; i < n; i++) {
        labels.push(monthShortLabel(msSeries[i]?.month ?? powerSeries[i]?.month ?? ""));
        msValues.push(msSeries[i]?.value ?? null);
        powerValues.push(powerSeries[i]?.value ?? null);
    }
    const avg = (vals) => {
        const real = vals.filter((v) => v != null && v > 0);
        return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
    };
    const msAvg = avg(msValues);
    const powerAvg = avg(powerValues);
    const index = (vals, base) => vals.map((v) => (v == null || base == null ? null : (v / base) * 100));
    const peakHourNote = traffic?.peakHour
        ? `Overall transaction peak hour (real DU log, all products combined — the log records total transactions per hour, not broken down by product, so this is not Power-specific): <strong>${traffic.peakHour.hour}:00-${traffic.peakHour.hour + 1}:00</strong>.`
        : `No real DU transaction log on file for this outlet, so no real peak-hour figure — Power-specific or otherwise — is available.`;
    return `
    ${renderLineChartSVG(labels, [
        { name: "MS (indexed, avg=100)", color: "#0057a8", values: index(msValues, msAvg) },
        { name: "Power (indexed, avg=100)", color: "#eb6834", values: index(powerValues, powerAvg) },
    ])}
    <p class="muted">Indexed to each product's own real average over the months on file (100 = that product's average) — MS is measured in KL and Power in units, so raw figures aren't on a shared scale; see the real monthly figures below.</p>
    <table class="table">
      <thead><tr><th>Month</th><th>MS (KL)</th><th>Power (units)</th></tr></thead>
      <tbody>${labels.map((l, i) => `<tr><td>${l}</td><td>${msValues[i] != null ? msValues[i].toFixed(2) : "-"}</td><td>${powerValues[i] != null ? powerValues[i].toFixed(2) : "-"}</td></tr>`).join("")}</tbody>
    </table>
    <p class="muted">${peakHourNote}</p>
  `;
}
function renderActionPointsSection(actionPoints) {
    if (!actionPoints.length)
        return `<p class="muted">No action points on file for this outlet yet.</p>`;
    return `
    <table class="table">
      <thead><tr><th>Date</th><th>Title</th><th>Raised by</th><th>Action required</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>
        ${actionPoints
        .map((a) => `<tr>
          <td>${escapeHtml(a.date)}</td>
          <td>${escapeHtml(a.title)}${a.notes ? `<br/><span class="muted">${escapeHtml(a.notes)}</span>` : ""}</td>
          <td>${escapeHtml(a.raisedBy)}</td>
          <td>${escapeHtml(a.actionRequired ?? "-")}</td>
          <td>${escapeHtml(a.owner ?? "-")}</td>
          <td>${escapeHtml(a.dueDate ?? "-")}</td>
          <td><select class="action-point-status" data-ap-id="${a.id}">
            ${["Open", "InProgress", "Done"].map((s) => `<option value="${s}" ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select></td>
        </tr>`)
        .join("")}
      </tbody>
    </table>`;
}
// ---------------------------------------------------------------------------
// Module 1 — Trading Area one-page snapshot
// ---------------------------------------------------------------------------
async function renderTradingAreasList() {
    const areas = await api.get("/trading-areas");
    app().innerHTML = `
    <section class="panel">
      <a href="#/outlets">&larr; All outlets</a>
      <h2>Trading Areas</h2>
      <p class="muted">Real HPCL Market Share reports group dealers (HPCL + competitor OMCs) into shared catchments. Click through for the one-page snapshot.</p>
      <div class="grid-cards">
        ${areas
        .map((a) => `<a class="card" href="#/trading-areas/${a.id}">
          <h3>${escapeHtml(a.name)}</h3>
          <p class="muted">${escapeHtml(a.month)} &middot; ${a.dealerCount} dealer(s) on file</p>
        </a>`)
        .join("") || "<p class='muted'>No trading areas on file yet.</p>"}
      </div>
    </section>`;
}
async function renderTradingAreaDetail(id) {
    const area = await api.get(`/trading-areas/${id}`);
    app().innerHTML = `
    <section class="panel">
      <a href="#/trading-areas">&larr; All trading areas</a>
      <h2>${escapeHtml(area.name)}</h2>
      <p class="muted">${escapeHtml(area.month)} snapshot &middot; real HPCL Market Share report, dealer-wise MS/HSD/TMF</p>

      <h3>Our outlets below this trading area's average volume</h3>
      <p class="muted">Average TMF (MS+HSD) across the ${escapeHtml(area.month)} report's dealers with a figure on file: ${fmtKL(area.averageTmfVolumeKL)} KL. Only our own outlets reporting below that average are listed here — the ones an SO needs to act on, not the full roster.</p>
      <div class="grid-cards">
        ${area.outlets
        .map((o) => `<a class="card" href="#/outlets/${o.id}">
          <h3>${escapeHtml(o.name)}</h3>
          <p>${escapeHtml(o.salesArea)} &middot; ${escapeHtml(o.status)}</p>
          <p class="muted">${escapeHtml(o.dealerName ?? "No dealer on record")}</p>
          <p class="muted">TMF: ${fmtKL(o.tmfVolumeKL)} KL (area average ${fmtKL(area.averageTmfVolumeKL)} KL)</p>
        </a>`)
        .join("") || "<p class='muted'>None of our outlets here are below the trading area average (or no outlets of ours are mapped to it yet).</p>"}
      </div>

      <h3>Competitive dealer-wise market share (${escapeHtml(area.month)})</h3>
      <table class="table">
        <thead><tr><th>Dealer</th><th>OMC</th><th>MS (KL)</th><th>MS share %</th><th>HSD (KL)</th><th>HSD share %</th><th>TMF (KL)</th><th>TMF share %</th></tr></thead>
        <tbody>
          ${area.dealers
        .map((d) => `<tr${d.omc === "HPCL" ? ' class="row--highlight"' : ""}>
            <td>${d.outletId ? `<a href="#/outlets/${d.outletId}">${escapeHtml(d.dealerName)}</a>` : escapeHtml(d.dealerName)}</td>
            <td>${escapeHtml(d.omc)}</td>
            <td>${fmtKL(d.msVolumeKL)}</td>
            <td>${fmtPct(d.msMarketSharePct)}</td>
            <td>${fmtKL(d.hsdVolumeKL)}</td>
            <td>${fmtPct(d.hsdMarketSharePct)}</td>
            <td>${fmtKL(d.tmfVolumeKL)}</td>
            <td>${fmtPct(d.tmfMarketSharePct)}</td>
          </tr>`)
        .join("")}
        </tbody>
      </table>
    </section>`;
}
function renderDataInputNotes(notes) {
    if (!notes.length)
        return `<p class="muted">No data submitted yet for this outlet.</p>`;
    return `
    <h4>Submission history</h4>
    ${notes
        .map((n) => `
      <div class="ai-output">
        <p class="muted">${new Date(n.submittedAt).toLocaleString()}</p>
        <pre>${escapeHtml(n.rawText)}</pre>
        ${n.structuredFieldUpdates.length ? `<p><strong>Applied:</strong> ${n.structuredFieldUpdates.map((u) => `${escapeHtml(u.field)}: ${escapeHtml(u.oldValue)} &rarr; ${escapeHtml(u.newValue)}`).join("; ")}</p>` : ""}
        ${n.masterSheetUpdates.length ? `<p><strong>Master Sheet updated:</strong> ${n.masterSheetUpdates.map((u) => escapeHtml(u.key)).join(", ")}</p>` : ""}
        ${n.freeTextNotes.length ? `<p><strong>Kept as note (not applied anywhere):</strong> ${n.freeTextNotes.map(escapeHtml).join("; ")}</p>` : ""}
      </div>`)
        .join("")}
  `;
}
// Separate "tab" for one outlet's itemised fixed-asset report (SAP FAIL format).
async function renderOutletFixedAssets(id) {
    const data = await api.get(`/outlets/${id}/fixed-assets`);
    const s = data.summary;
    app().innerHTML = `
    <section class="panel">
      <a href="#/outlets/${id}">&larr; ${escapeHtml(data.outlet.name)}</a>
      <h2>Fixed Asset Report — ${escapeHtml(data.outlet.name)}</h2>
      <p class="muted">SAP FAIL (Fixed Asset Individual Listing) format.</p>
      ${s.count
        ? `<p>
        Total Invested: <strong>Rs. ${s.totalInvested.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Total Depreciation: <strong>Rs. ${s.totalDepreciation.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Net Book Value: <strong>Rs. ${s.totalNetBookValue.toLocaleString("en-IN")}</strong>
      </p>`
        : `<p class="muted">No fixed-asset ledger (SAP FAIL) on file for this SAP code yet.</p>`}
      <table class="table">
        <thead><tr><th>Asset Class</th><th>Description</th><th>Gross Block</th><th>Depreciation Reserve</th><th>Net Book Value</th><th>Useful Life</th><th>Capitalized On</th></tr></thead>
        <tbody>
          ${data.fixedAssets
        .map((a) => `<tr><td>${escapeHtml(a.assetClassDescription)}</td><td>${escapeHtml(a.assetDescription)}</td><td>Rs. ${a.grossBlock.toLocaleString("en-IN")}</td><td>Rs. ${a.depreciationReserve.toLocaleString("en-IN")}</td><td>Rs. ${a.netBookValue.toLocaleString("en-IN")}</td><td>${a.usefulLifeYears} yrs</td><td>${escapeHtml(a.capitalizedOn)}</td></tr>`)
        .join("") || "<tr><td colspan='7'>No fixed assets on file.</td></tr>"}
        </tbody>
      </table>
    </section>`;
}
// ---------------------------------------------------------------------------
// Module 2 — Dealer Selection & Development workflow
// ---------------------------------------------------------------------------
async function renderCases() {
    const [cases, outlets] = await Promise.all([api.get("/cases"), api.get("/outlets")]);
    app().innerHTML = `
    <section class="panel">
      <h2>Dealer Selection &amp; Development</h2>
      <p class="muted">Stretch identification &rarr; feasibility &rarr; application &rarr; ASC/LEC/FVC &rarr; file note &rarr; LOI &rarr; milestones &rarr; NOC (auto-generates lease + dealership agreement) &rarr; MDM/SAP &rarr; budget &rarr; project &rarr; commissioning. Modernisation requests (canopy/driveway/DU/tank/electric panel) are raised via Module 7 and reviewed on the outlet page.</p>

      <h3>Step 1 — KML stretch identification</h3>
      <p class="muted">Locate industry outlets from a KML/KMZ export and identify stretches with no HPCL presence. Paste real KML Placemark XML, or run against the real sample stretch (CNG-addition proposed sites, Faridabad SA).</p>
      <form id="kml-form" class="form">
        <label>KML text (optional — leave blank to use the real sample stretch) <textarea name="kmlText" placeholder="<Placemark>...</Placemark>"></textarea></label>
        <button type="submit" class="btn">Analyze stretch</button>
      </form>
      <div id="kml-result"></div>

      <h3>Open a new case</h3>
      <form id="new-case-form" class="form">
        <label>Case type
          <select name="caseType" id="case-type-select">
            <option value="NewSiteDevelopment">New site development</option>
            <option value="Resitement">Resitement (relocate an existing outlet)</option>
          </select>
        </label>
        <label>Sales Area <input name="salesArea" value="Faridabad SA" required /></label>
        <label>Stretch / site name <input name="stretchName" placeholder="e.g. NH-19 Faridabad-Ballabgarh stretch" required /></label>
        <label>KML file name <input name="kmlFileName" placeholder="faridabad_sa.kmz" /></label>
        <label>Competitor context (IOCL/BPCL outlets present, no HPCL) <textarea name="competitorContext" required></textarea></label>
        <div id="resitement-fields" style="display:none">
          <label>Existing outlet to resite
            <select name="existingOutletId">${outlets.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("")}</select>
          </label>
          <label>Grounds (per Resitement Policy 1.1) — comma-separated
            <input name="groundsRaw" placeholder="(f) No valid lease / no tenancy protection available" />
          </label>
          <label>Dealer's resitement request <textarea name="dealerRequestText"></textarea></label>
        </div>
        <button type="submit" class="btn">Create case</button>
      </form>

      <h3>Cases</h3>
      <div class="grid-cards">
        ${cases
        .map((c) => `
          <a class="card" href="#/cases/${c.id}">
            <h3>${escapeHtml(c.stretchName)}</h3>
            <p>${escapeHtml(c.salesArea)} ${c.caseType === "Resitement" ? "· <strong>Resitement</strong>" : ""}</p>
            <p class="badge">${escapeHtml(c.stage)}</p>
          </a>`)
        .join("") || "<p>No cases yet.</p>"}
      </div>
    </section>`;
    qs("#case-type-select").addEventListener("change", (e) => {
        const show = e.target.value === "Resitement";
        qs("#resitement-fields").style.display = show ? "flex" : "none";
    });
    qs("#kml-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const res = await api.post("/kml/analyze", { kmlText: data["kmlText"] || undefined });
        qs("#kml-result").innerHTML = `
      <div class="ai-output">${res.totalOutlets} placemark(s) parsed. HPCL presence in stretch: ${res.hasHpclPresence ? "Yes" : "No"}.
      ${res.hasHpclPresence ? "" : "\n-> Gap identified: no existing HPCL outlet in this stretch — candidate for new site development."}
      \n\nOther placemarks (competitors / proposed candidates): ${res.competitorOutlets.map((p) => `${p.name} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`).join("; ") || "none"}
      \nExisting HPCL placemarks: ${res.hpclOutlets.map((p) => `${p.name} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`).join("; ") || "none"}</div>`;
    });
    qs("#new-case-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const body = {
            caseType: data["caseType"],
            salesArea: data["salesArea"],
            stretchName: data["stretchName"],
            kmlFileName: data["kmlFileName"],
            competitorContext: data["competitorContext"],
        };
        if (data["caseType"] === "Resitement") {
            body["existingOutletId"] = data["existingOutletId"];
            body["groundsSelected"] = (data["groundsRaw"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
            body["dealerRequestText"] = data["dealerRequestText"];
        }
        const created = await api.post("/cases", body);
        toast("Case created");
        location.hash = `#/cases/${created.id}`;
    });
}
function stageBanner(stage) {
    const idx = [
        "StretchIdentification",
        "FeasibilityReport",
        "Roster",
        "ApplicationIntake",
        "SiteInspections",
        "FileNoteApproval",
        "LOIIssued",
        "MilestoneTracking",
        "CustomerMasterSync",
        "BudgetApproval",
        "ProjectExecution",
        "Commissioned",
    ].indexOf(stage);
    return `<p class="badge badge--stage">Stage ${idx + 1}/12: ${escapeHtml(stage)}</p>`;
}
function selectOptions(options, current) {
    return options.map((o) => `<option value="${escapeHtml(o)}" ${o === current ? "selected" : ""}>${escapeHtml(o || "(blank)")}</option>`).join("");
}
function taRowsToLines(rows) {
    return rows.map((r) => `${r.roName} | ${r.distanceFromProposedKm ?? ""} | ${r.oilCo} | ${r.msKLPM} | ${r.hsdKLPM}`).join("\n");
}
function renderFeasibilityFormSection(c, f) {
    return `
    <h3>Feasibility Report <span class="muted">(real HPCL "Report on Feasibility: Proposed Retail Outlet" format)</span></h3>
    <form id="feasibility-form" class="form">
      <label>Location <input name="locationName" value="${escapeHtml(f.locationName)}" required /></label>
      <label>District <input name="district" value="${escapeHtml(f.district)}" required /></label>
      <label>State <input name="state" value="${escapeHtml(f.state)}" required /></label>
      <label>1. Class of Market (A/B/C/D1(NH)/D2(SH)/E)
        <select name="classOfMarket">${selectOptions(["A", "B", "C", "D1(NH)", "D2(SH)", "E"], f.classOfMarket)}</select>
      </label>
      <label>2. Existing Trading Area / Monopoly
        <select name="existingTradingAreaOrMonopoly">${selectOptions(["Existing", "Monopoly", "New"], f.existingTradingAreaOrMonopoly)}</select>
      </label>
      <label>3. LSA / Remote Area <input name="lsaOrRemoteArea" value="${escapeHtml(f.lsaOrRemoteArea)}" placeholder="e.g. Remote AREA" /></label>

      <label>4. Trading Area Potential — MS &amp; HSD sales from T.A. ROs for last 12 months (one per line: Name of RO | Distance km | Oil Co. (HPC/IOC/BPC/Pvt.) | MS KLPM | HSD KLPM)
        <textarea name="taLines" rows="5">${escapeHtml(taRowsToLines(f.tradingAreaPotential))}</textarea>
      </label>

      <h4>5. Assessment of Potential of Proposed location</h4>
      <label>a. Traffic <select name="trafficLevel">${selectOptions(["High", "Medium", "Low"], f.trafficLevel)}</select></label>
      <label>Expected % Growth in Traffic <input name="expectedTrafficGrowthPct" type="number" step="any" value="${f.expectedTrafficGrowthPct}" /></label>
      <label>Reason for Growth in Traffic <input name="reasonForTrafficGrowth" value="${escapeHtml(f.reasonForTrafficGrowth)}" /></label>

      <label>b. Present TA Growth MS (KLPM) <input name="presentTAGrowthMsKLPM" type="number" step="any" value="${f.presentTAGrowthMsKLPM}" /></label>
      <label>Present TA Growth HSD (KLPM) <input name="presentTAGrowthHsdKLPM" type="number" step="any" value="${f.presentTAGrowthHsdKLPM}" /></label>
      <label>Expected % Growth in TA — MS <input name="expectedTAGrowthMsPct" type="number" step="any" value="${f.expectedTAGrowthMsPct}" /></label>
      <label>Expected % Growth in TA — HSD <input name="expectedTAGrowthHsdPct" type="number" step="any" value="${f.expectedTAGrowthHsdPct}" /></label>
      <label>Expected T.A. Potential in KLPM — MS <input name="expectedTAPotentialMsKLPM" type="number" step="any" value="${f.expectedTAPotentialMsKLPM}" /></label>
      <label>Expected T.A. Potential in KLPM — HSD <input name="expectedTAPotentialHsdKLPM" type="number" step="any" value="${f.expectedTAPotentialHsdKLPM}" /></label>
      <label>Whether proposed RO meets volume norms of the market
        <select name="meetsVolumeNorms">${selectOptions(["", "Yes", "No"], f.meetsVolumeNorms)}</select>
      </label>
      <label>Reason for Anticipated Growth in Sales Vol. (MS/HSD) in the trading area
        <input name="reasonForAnticipatedGrowth" value="${escapeHtml(f.reasonForAnticipatedGrowth)}" />
      </label>

      <label>c. Estimated Sales — 1st Year MS (KL/Month) <input name="estimatedSalesYear1Ms" type="number" step="any" value="${f.estimatedSalesYear1Ms}" /></label>
      <label>1st Year HSD <input name="estimatedSalesYear1Hsd" type="number" step="any" value="${f.estimatedSalesYear1Hsd}" /></label>
      <label>2nd Year MS <input name="estimatedSalesYear2Ms" type="number" step="any" value="${f.estimatedSalesYear2Ms}" /></label>
      <label>2nd Year HSD <input name="estimatedSalesYear2Hsd" type="number" step="any" value="${f.estimatedSalesYear2Hsd}" /></label>
      <label>3rd Year MS <input name="estimatedSalesYear3Ms" type="number" step="any" value="${f.estimatedSalesYear3Ms}" /></label>
      <label>3rd Year HSD <input name="estimatedSalesYear3Hsd" type="number" step="any" value="${f.estimatedSalesYear3Hsd}" /></label>

      <label>6. Market Intelligence if any (Proposed OMC activity, any other factor influencing Sales)
        <textarea name="marketIntelligence">${escapeHtml(f.marketIntelligence)}</textarea>
      </label>
      <label>7. General Information (Any Site identified, Whether location considered earlier, etc.)
        <textarea name="generalInformation">${escapeHtml(f.generalInformation)}</textarea>
      </label>

      <h4>8. Recommendation</h4>
      <label>(a) Proposed RO Feasible as per Volume Norms (in 2nd year of operation) of the market (Yes/No)
        <select name="feasibleAsPerVolumeNorms">${selectOptions(["", "Yes", "No"], f.feasibleAsPerVolumeNorms)}</select>
      </label>
      <label>May be included in SRMP (Y/N) <select name="mayBeIncludedInSrmp">${selectOptions(["", "Yes", "No"], f.mayBeIncludedInSrmp)}</select></label>
      <label>If Yes, Regular or Rural <select name="regularOrRural">${selectOptions(["", "Regular", "Rural"], f.regularOrRural)}</select></label>

      <h4>Lay Out Sketch of Proposed Location</h4>
      <label>Road NO. (NH/SH/ Other Road No.) if any <input name="roadNo" value="${escapeHtml(f.roadNo)}" /></label>
      <label>Stretch / Boundary of location <input name="stretchBoundary" value="${escapeHtml(f.stretchBoundary)}" /></label>
      <label>From KM Stone <input name="kmStoneFrom" value="${escapeHtml(f.kmStoneFrom)}" /></label>
      <label>To KM Stone <input name="kmStoneTo" value="${escapeHtml(f.kmStoneTo)}" /></label>
      <label>Distance from prominent land mark <input name="distanceFromLandmark" value="${escapeHtml(f.distanceFromLandmark)}" /></label>
      <label>Identification of boundary / stretch <input name="boundaryIdentification" value="${escapeHtml(f.boundaryIdentification)}" /></label>
      <label>Any other information <input name="otherInfo" value="${escapeHtml(f.otherInfo)}" /></label>
      <label>Divided / Un-divided carriageway
        <select name="carriagewayType">${selectOptions(["Divided carriageway", "Undivided carriageway"], f.carriagewayType)}</select>
      </label>
      <label>Distance of nearby RO from the proposed RO Location <input name="nearbyRODistanceNote" value="${escapeHtml(f.nearbyRODistanceNote)}" /></label>

      <label>Prepared by <input name="preparedBy" value="${escapeHtml(f.preparedBy)}" required /></label>
      <label>Designation <input name="designation" value="${escapeHtml(f.designation)}" required /></label>
      <label>Report date <input name="reportDate" type="date" value="${escapeHtml(f.reportDate)}" /></label>

      <button type="submit" class="btn">Save &amp; generate feasibility report</button>
    </form>
    ${c.feasibilityReport
        ? `<pre class="ai-output">${escapeHtml(c.feasibilityReport.text)}</pre>
           <p><a class="btn btn--sm" href="/api/cases/${c.id}/feasibility-report.pdf" target="_blank">⬇ Download feasibility report PDF</a></p>`
        : ""}
  `;
}
function activityRowsToLines(rows) {
    return rows.map((a) => `${a.activity} | ${a.date} | ${a.team} | ${a.result} | ${a.attachment}`).join("\n");
}
function renderFileNoteFormSection(c, f) {
    return `
    <h3>File Note for LOI <span class="muted">(real HPCL file-note format — advertisement, selection history, ASC/LEC/FVC, approval ask)</span></h3>
    <form id="file-note-form" class="form">
      <label>Name of Regional Office <input name="regionalOfficeName" value="${escapeHtml(f.regionalOfficeName)}" /></label>
      <label>Advertised Location Description <input name="advertisedLocationDescription" value="${escapeHtml(f.advertisedLocationDescription)}" required /></label>
      <label>Location Serial No <input name="locationSerialNo" value="${escapeHtml(f.locationSerialNo)}" /></label>
      <label>Advertisement Date <input name="advertisementDate" type="date" value="${escapeHtml(f.advertisementDate)}" /></label>
      <label>Newspapers <input name="newspapers" value="${escapeHtml(f.newspapers)}" placeholder="e.g. Dainik Bhaskar/The Times of India" /></label>
      <label>Last Date to Apply <input name="lastDateToApply" type="date" value="${escapeHtml(f.lastDateToApply)}" /></label>

      <label>Category <input name="category" value="${escapeHtml(f.category)}" /></label>
      <label>Type of RO <input name="typeOfRO" value="${escapeHtml(f.typeOfRO)}" /></label>
      <label>Class of Market <input name="classOfMarket" value="${escapeHtml(f.classOfMarket)}" /></label>
      <label>Type of Sites <input name="typeOfSite" value="${escapeHtml(f.typeOfSite)}" placeholder="e.g. CFS" /></label>
      <label>Plot Size (m) <input name="plotSizeM" value="${escapeHtml(f.plotSizeM)}" placeholder="e.g. 20 X 20" /></label>
      <label>District <input name="district" value="${escapeHtml(f.district)}" /></label>
      <label>Mode of Selection <input name="modeOfSelection" value="${escapeHtml(f.modeOfSelection)}" placeholder="e.g. Draw of lots" /></label>
      <label>No. of Response <input name="noOfResponse" value="${escapeHtml(f.noOfResponse)}" placeholder="e.g. 7 (Gr.1: 0, Gr.2: 2, Gr. 3: 5)" /></label>

      <label>Selection Narrative <span class="muted">(the case's own applications/draw-of-lots/rejection/selection story, one or more paragraphs)</span>
        <textarea name="selectionNarrative" rows="6">${escapeHtml(f.selectionNarrative)}</textarea>
      </label>

      <label>ASC Committee Size <input name="ascCommitteeSize" type="number" value="${f.ascCommitteeSize}" /></label>
      <label>ASC Date <input name="ascDate" type="date" value="${escapeHtml(f.ascDate)}" /></label>
      <label>ASC Annexure Ref <input name="ascAnnexureRef" value="${escapeHtml(f.ascAnnexureRef)}" placeholder="e.g. 6" /></label>

      <label>Activity Table <span class="muted">(one per line: Activity | Date | Team | Result/Observations | Attachment)</span>
        <textarea name="activityLines" rows="9">${escapeHtml(activityRowsToLines(f.activities))}</textarea>
      </label>

      <label>Selected Applicant Name <input name="selectedApplicantName" value="${escapeHtml(f.selectedApplicantName)}" required /></label>
      <label>Advocate Report Date <input name="advocateReportDate" type="date" value="${escapeHtml(f.advocateReportDate)}" /></label>
      <label>Land Parcel Description <span class="muted">(Khata/Mustil/Killa/Khewat/Khatoni no.)</span>
        <textarea name="landParcelDescription">${escapeHtml(f.landParcelDescription)}</textarea>
      </label>
      <label>Jamabandi Year <input name="jamabandiYear" value="${escapeHtml(f.jamabandiYear)}" /></label>
      <label>Village <input name="village" value="${escapeHtml(f.village)}" /></label>
      <label>Tehsil <input name="tehsil" value="${escapeHtml(f.tehsil)}" /></label>
      <label>Verified Area (sq m) <input name="verifiedAreaSqM" value="${escapeHtml(f.verifiedAreaSqM)}" /></label>
      <label>FVC Date <input name="fvcDate" type="date" value="${escapeHtml(f.fvcDate)}" /></label>
      <label>Land Documents Annexure Ref <input name="landDocumentsAnnexureRef" value="${escapeHtml(f.landDocumentsAnnexureRef)}" placeholder="e.g. 15" /></label>
      <label>Dealer Portal Annexure Ref <input name="dealerPortalAnnexureRef" value="${escapeHtml(f.dealerPortalAnnexureRef)}" placeholder="e.g. 17" /></label>

      <label>List of Annexures <span class="muted">(one per line)</span>
        <textarea name="annexureListLines" rows="6">${escapeHtml((f.annexureList ?? []).join("\n"))}</textarea>
      </label>

      <button type="submit" class="btn">Save &amp; generate file note</button>
    </form>`;
}
async function renderCaseDetail(id) {
    const c = await api.get(`/cases/${id}`);
    const feasibilityForm = await api.get(`/cases/${id}/feasibility-form`);
    const fileNoteForm = await api.get(`/cases/${id}/file-note-form`);
    const budgetCostEstimate = c.customerMaster ? await api.get(`/cases/${id}/budget-cost-estimate`) : null;
    const sections = [];
    sections.push(`<a href="#/cases">&larr; All cases</a><h2>${escapeHtml(c.stretchName)}</h2>${stageBanner(c.stage)}`);
    sections.push(`<p>${escapeHtml(c.salesArea)} · KML: ${escapeHtml(c.kmlFileName ?? "-")}${c.caseType === "Resitement" ? " · <strong>Resitement case</strong>" : ""}</p><p>${escapeHtml(c.competitorContext)}</p>`);
    if (c.resitement) {
        const r = c.resitement;
        sections.push(`
      <h3>Resitement details</h3>
      <p><strong>Existing outlet:</strong> <a href="#/outlets/${r.existingOutletId}">${escapeHtml(r.existingOutletName)}</a></p>
      <p><strong>Grounds:</strong> ${r.groundsSelected.map(escapeHtml).join("; ") || "(none recorded)"}</p>
      <p><strong>Dealer's request</strong> (${escapeHtml(r.dealerRequestDate)}):</p>
      <pre class="ai-output">${escapeHtml(r.dealerRequestText || "(not recorded)")}</pre>
      ${r.legalOpinionText ? `<p><strong>Legal opinion:</strong></p><pre class="ai-output">${escapeHtml(r.legalOpinionText)}</pre>` : ""}
      <h4>Technical Evaluation Committee</h4>
      <ul>${r.technicalEvaluationCommittee.map((m) => `<li>${escapeHtml(m.designation)} (${escapeHtml(m.name)})</li>`).join("") || "<li class='muted'>No members appointed yet.</li>"}</ul>
      <form id="committee-form" class="form--inline">
        <input name="name" placeholder="Member name/initials" required />
        <input name="designation" placeholder="Designation" required />
        <button type="submit" class="btn btn--sm">Add member</button>
      </form>
      ${r.technicalEvaluationReportText
            ? `<h4>Technical Evaluation Report</h4><pre class="ai-output">${escapeHtml(r.technicalEvaluationReportText)}</pre>`
            : `<button id="gen-tech-eval" class="btn" ${r.technicalEvaluationCommittee.length ? "" : "disabled"}>Generate technical evaluation report (AI)</button>`}
    `);
    }
    // Interested applicants — people who've come forward for this stretch before (or instead of)
    // a formal Application Form intake.
    sections.push(`
    <h3>Interested applicants</h3>
    <table class="table"><thead><tr><th>Name</th><th>Stretch</th><th>Land details</th><th>Category</th><th>Mobile No.</th><th>Added</th></tr></thead>
    <tbody>${c.interestedApplicants
        .map((ia) => `<tr><td>${escapeHtml(ia.name)}</td><td>${escapeHtml(ia.stretchName)}</td><td>${escapeHtml(ia.landDetails)}</td><td>${escapeHtml(ia.category)}</td><td>${escapeHtml(ia.mobileNo)}</td><td>${ia.addedAt.slice(0, 10)}</td></tr>`)
        .join("") || "<tr><td colspan='6'>No interested applicants recorded yet.</td></tr>"}</tbody></table>
    <form id="interested-applicant-form" class="form form--inline">
      <input name="name" placeholder="Applicant name" required />
      <input name="stretchName" placeholder="Stretch" value="${escapeHtml(c.stretchName)}" />
      <input name="landDetails" placeholder="Land details" />
      <input name="category" placeholder="Category (e.g. OPEN/SC/ST/OBC)" />
      <input name="mobileNo" placeholder="Mobile No." />
      <button type="submit" class="btn btn--sm">Add interested applicant</button>
    </form>
  `);
    // Roster
    sections.push(`
    <h3>Roster of feasible outlets</h3>
    <table class="table"><thead><tr><th>Candidate</th><th>Location</th><th>Priority</th><th>Feasible</th><th>Remarks</th></tr></thead>
    <tbody>${c.roster.map((r) => `<tr><td>${escapeHtml(r.candidateName)}</td><td>${escapeHtml(r.location)}</td><td>${r.priority}</td><td>${r.feasible ? "Yes" : "No"}</td><td>${escapeHtml(r.remarks)}</td></tr>`).join("") || "<tr><td colspan='5'>No roster entries yet.</td></tr>"}</tbody></table>
    <form id="roster-form" class="form">
      <label>Add candidates (one per line: Name | Location | Priority | Feasible(yes/no) | Remarks)
        <textarea name="lines" placeholder="KM 14 Highway Plot | NH-19 near Sector 65 | 1 | yes | Good visibility"></textarea>
      </label>
      <button type="submit" class="btn">Save roster</button>
    </form>
  `);
    // Feasibility Report — structured, matches HPCL's real "Report on Feasibility: Proposed Retail
    // Outlet" form exactly (section numbers/labels below mirror that form).
    sections.push(renderFeasibilityFormSection(c, feasibilityForm));
    // Application (field set mirrors HPCL's real "Application for Retail Outlet Dealership" form)
    sections.push(`
    <h3>Application intake</h3>
    ${c.application
        ? `<table class="table"><tbody>${Object.entries(c.application)
            .filter(([k]) => k !== "otherFields")
            .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
            .join("")}</tbody></table>`
        : `<div class="form">
        <label>Upload dealer's Application Form (optional — reads real text out of PDF/DOCX/TXT/MD and best-effort matches known fields; a genuinely scanned image PDF has no text layer to read and won't extract, since no OCR service is available offline)
          <input id="application-upload" type="file" accept=".txt,.md,.pdf,.docx" />
        </label>
        ${c.applicationFormUpload
            ? `<p class="muted">Uploaded: <strong>${escapeHtml(c.applicationFormUpload.fileName)}</strong> — ${c.applicationFormUpload.extractedFieldsCount} field(s) extracted, ${c.applicationFormUpload.uploadedAt.slice(0, 19).replace("T", " ")}. This is saved on the case for later reference.</p>`
            : ""}
        <div id="application-upload-warnings" class="muted">${c.applicationFormUpload?.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join("") ?? ""}</div>
      </div>
      <form id="application-form" class="form">
        <p class="muted">Field set mirrors the real Dealer Selection Guidelines 2023 Appendix-IA/IB application form. These fields auto-populate the ASC/LEC/FVC checklists below — enter them once here.</p>
        <label>Application No. <input name="applicationNo" placeholder="HPC..." /></label>
        <label>Applicant name <input name="applicantName" required /></label>
        <label>Father's/Husband's name <input name="fatherOrSpouseName" /></label>
        <label>Spouse name (if married) <input name="spouseName" /></label>
        <label>Address <input name="address" /></label>
        <label>District <input name="district" /></label>
        <label>State <input name="state" /></label>
        <label>Category
          <select name="applicantCategory"><option>OPEN</option><option>SC</option><option>ST</option><option>OBC</option><option>PH</option><option>DP</option><option>ExSM</option><option>Other</option></select>
        </label>
        <label>Group
          <select name="group"><option>Group 1</option><option>Group 2</option><option>Group 3</option></select>
        </label>
        <label>Type of RO
          <select name="typeOfRO"><option>Regular</option><option>Rural</option></select>
        </label>
        <label>Ownership type
          <select name="ownershipType"><option>Owned</option><option>Leased</option><option>Family</option><option>Other</option></select>
        </label>
        <label>Khasra/Khatouni No. <input name="landKhasraKhatouniNo" /></label>
        <label>Revenue village <input name="revenueVillage" /></label>
        <label>Tehsil <input name="tehsil" /></label>
        <label>Frontage (m) <input name="frontageM" type="number" step="0.01" /></label>
        <label>Depth (m) <input name="depthM" type="number" step="0.01" /></label>
        <label>Area (sqm) <input name="areaSqM" type="number" step="0.01" /></label>
        <label>Land details <textarea name="landDetails"></textarea></label>
        <button type="submit" class="btn">Save application</button>
      </form>`}
  `);
    // Inspections — real DSG Annexure V (ASC) / W1 (LEC) / Y (FVC) formats. All fields already
    // captured on the Application Form above are auto-populated server-side; only the committee's
    // own Yes/No findings are entered here.
    sections.push(`<h3>Site clearances (ASC / LEC / FVC)</h3>`);
    sections.push(renderAscBlock(c));
    sections.push(renderLecBlock(c));
    sections.push(renderFvcBlock(c));
    // File note for LOI — real HPCL "Approved File Note" routing-chain format, matched to a
    // real sample file note (advertisement/location details, selection narrative, ASC confirmation,
    // activity table, land/site/FVC verification, approval ask, annexure list).
    sections.push(renderFileNoteFormSection(c, fileNoteForm));
    sections.push(`
    ${c.fileNote
        ? `
      <p>System ID: ${escapeHtml(c.fileNote.systemId)} · Initiated: ${escapeHtml(c.fileNote.initiatedOn)}</p>
      <p><strong>${escapeHtml(c.fileNote.subject)}</strong></p>
      ${c.fileNote.routing
            .map((r) => `
        <div class="routing-stage">
          <p class="muted">${escapeHtml(r.role)} — ${escapeHtml(r.actorName)}, ${escapeHtml(r.actorTitle)} · ${r.timestamp.slice(0, 19).replace("T", " ")}</p>
          <pre class="ai-output">${escapeHtml(r.remarks)}</pre>
        </div>`)
            .join("")}
      <p>Status: <strong>${escapeHtml(c.fileNote.status)}</strong></p>
      ${c.fileNote.policyClausesCited.length ? `<p class="muted">Clauses cited: ${c.fileNote.policyClausesCited.map(escapeHtml).join("; ")}</p>` : ""}
      <p><a class="btn btn--sm" href="/api/cases/${c.id}/file-note.pdf" target="_blank">⬇ Download file note PDF</a></p>
      `
        : "<p class='muted'>Not generated yet.</p>"}
    ${c.fileNote && c.fileNote.status === "Draft"
        ? `<form id="filenote-decision" class="form">
        <input name="approvedBy" placeholder="Approver name" required />
        <input name="actorTitle" placeholder="Approver title (e.g. Deputy General Manager, Retail Region)" required />
        <input name="remarks" placeholder="Remarks (optional)" />
        <div class="form--inline">
          <button type="submit" name="approve" value="1" class="btn">Approve</button>
          <button type="submit" name="approve" value="0" class="btn btn--danger">Reject</button>
        </div>
      </form>`
        : ""}
  `);
    // LOI (styled as the real Intimation Letter)
    sections.push(`
    <h3>Intimation Letter (LOI)</h3>
    ${c.loi ? `<pre class="ai-output">${escapeHtml(c.loi.text)}</pre><p><a class="btn" href="/api/cases/${c.id}/loi.pdf" target="_blank">⬇ Download PDF</a></p>` : `<button id="gen-loi" class="btn" ${c.fileNote?.status === "Approved" ? "" : "disabled"}>Generate Intimation Letter (AI)</button>`}
  `);
    // Milestones
    if (c.milestones.length) {
        sections.push(`
      <h3>2-way milestone tracking</h3>
      <table class="table">
        <thead><tr><th>Milestone</th><th>Status</th><th>Date</th><th>Update</th></tr></thead>
        <tbody>${c.milestones
            .map((m) => `
          <tr>
            <td>${escapeHtml(m.label)}</td>
            <td><span class="badge badge--${m.status.toLowerCase()}">${escapeHtml(m.status)}</span></td>
            <td>${escapeHtml(m.date?.slice(0, 10) ?? "-")}</td>
            <td>
              <form class="form form--inline milestone-form" data-key="${m.key}">
                <select name="status">
                  <option ${m.status === "Pending" ? "selected" : ""}>Pending</option>
                  <option ${m.status === "InProgress" ? "selected" : ""}>InProgress</option>
                  <option ${m.status === "Done" ? "selected" : ""}>Done</option>
                  <option ${m.status === "Stuck" ? "selected" : ""}>Stuck</option>
                </select>
                <input name="notes" placeholder="notes" />
                <button type="submit" class="btn btn--sm">Update</button>
              </form>
            </td>
          </tr>`)
            .join("")}</tbody>
      </table>
      <form id="add-milestone-form" class="form form--inline">
        <input name="label" placeholder="Custom milestone (e.g. Fire NOC, Pollution NOC)" required />
        <button type="submit" class="btn btn--sm">Add milestone</button>
      </form>
    `);
    }
    // Lease Agreement & Dealership Agreement — auto-generated on NOC receipt.
    if (c.leaseAgreement || c.dealershipAgreement) {
        sections.push(`
      <h3>Lease Agreement &amp; Dealership Agreement <span class="muted">(auto-generated on NOC receipt)</span></h3>
      ${c.leaseAgreement
            ? `<h4>Lease Agreement</h4><pre class="ai-output">${escapeHtml(c.leaseAgreement.text)}</pre><p><a class="btn" href="/api/cases/${c.id}/lease.pdf" target="_blank">⬇ Download Lease Deed PDF</a></p>`
            : ""}
      ${c.dealershipAgreement
            ? `<h4>Dealership Agreement</h4><pre class="ai-output">${escapeHtml(c.dealershipAgreement.text)}</pre><p><a class="btn" href="/api/cases/${c.id}/dealership-agreement.pdf" target="_blank">⬇ Download Dealership Agreement PDF</a></p>`
            : ""}
    `);
    }
    // Customer master sync
    if (c.stage === "MilestoneTracking" || c.customerMaster) {
        sections.push(`
      <h3>MDM &amp; SAP customer master</h3>
      ${c.customerMaster
            ? `<p>Synced. Customer code: <strong>${escapeHtml(c.customerMaster.customerCode)}</strong></p>`
            : `<button id="sync-customer" class="btn">Sync to MDM &amp; SAP (requires NOC = Done)</button>`}
    `);
    }
    // Budget — real cost-estimate + IRR engine (same as modernisation requests), combining every
    // rate-card category since a new site needs Civil Works, Driveway, DU, Tank and Electric Panel
    // together. Volume envisaged is collected from the SO; cost estimate and IRR are auto-computed.
    if (c.customerMaster) {
        sections.push(renderNroBudgetSection(c, budgetCostEstimate));
    }
    // Project execution / Gantt — post-NOC project schedule with a real critical-path highlight.
    if (c.project) {
        sections.push(`
      <h3>Project management &amp; Gantt chart <span class="muted">(post-NOC schedule, critical path highlighted)</span></h3>
      ${renderGanttChart(c.project.ganttTasks)}
      <p>Estimated commissioning: <strong>${c.project.estimatedCommissionDate}</strong></p>
      ${c.stage === "ProjectExecution" ? `<button id="commission-btn" class="btn">Commission outlet — mark Nozzle Sales Started</button>` : ""}
    `);
    }
    // Commissioned
    if (c.stage === "Commissioned") {
        sections.push(`<h3>Outlet commissioned</h3><p><a href="#/outlets/${c.outletId}">View outlet record &rarr;</a> — modernisation requests (raised via Module 7) and further requests are managed from the outlet page.</p>`);
    }
    sections.push(`
    <h3>Activity log</h3>
    <ul class="log">${c.activityLog.map((a) => `<li><span class="muted">${a.timestamp.slice(0, 19).replace("T", " ")}</span> — <strong>${escapeHtml(a.actor)}</strong>: ${escapeHtml(a.action)}${a.details ? ` (${escapeHtml(a.details)})` : ""}</li>`).join("")}</ul>
  `);
    app().innerHTML = `<section class="panel">${sections.join("")}</section>`;
    wireCaseHandlers(c);
}
/**
 * Budget approval for a New Retail Outlet — same real cost-estimate + IRR engine as the
 * modernisation-request flow (services/modernisation.ts), combining every rate-card category
 * (Civil Works, Driveway, DU, Tank, Electric Panel) since a new site build needs all of them.
 * The SO adjusts qty/rate to the actual site plan and supplies the volume envisaged; IRR is
 * auto-computed from that, never entered as a raw number.
 */
function renderNroBudgetSection(c, defaultCostEstimate) {
    const budget = c.budget ?? { costEstimate: defaultCostEstimate, irr: null, status: "Draft" };
    const ce = budget.costEstimate ?? defaultCostEstimate;
    const irr = budget.irr;
    const sections = [`<h3>Budget approval / IRR / cost estimate <span class="muted">(New Retail Outlet — real HPCL standard rates)</span></h3>`];
    sections.push(`
    <form id="budget-cost-form" class="form">
      <table class="table">
        <thead><tr><th>Description</th><th>Bucket</th><th>Qty</th><th>UOM</th><th>Rate (Rs.)</th><th>Amount (Rs.)</th></tr></thead>
        <tbody>
          ${ce.lineItems
        .map((li) => `<tr>
            <td>${escapeHtml(li.description)}</td>
            <td>${li.depreciationBucket === "Civil" ? "Civil (10%)" : "Plant & Machinery (15%)"}</td>
            <td><input name="qty_${li.id}" type="number" step="0.01" value="${li.qty}" style="width:6rem" /></td>
            <td>${escapeHtml(li.uom)}</td>
            <td><input name="rate_${li.id}" type="number" step="0.01" value="${li.rate}" style="width:8rem" /></td>
            <td>Rs. ${li.amount.toLocaleString("en-IN")}</td>
          </tr>`)
        .join("")}
        </tbody>
      </table>
      <p>
        Subtotal: <strong>Rs. ${ce.subtotal.toLocaleString("en-IN")}</strong>
        (Civil Rs. ${ce.civilAmount.toLocaleString("en-IN")} + Plant &amp; Machinery Rs. ${ce.plantMachineryAmount.toLocaleString("en-IN")})
        &nbsp;|&nbsp; GST addback (${ce.gstRatePct}% &times; ${ce.gstNonCreditablePct}% non-creditable): <strong>Rs. ${ce.gstAddback.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Total Investment: <strong>Rs. ${ce.totalInvestment.toLocaleString("en-IN")}</strong>
      </p>
      <button type="submit" class="btn btn--sm">Recompute cost estimate</button>
    </form>

    <h4>IRR <span class="muted">(WDV depreciation, real HQO circular rates — Gross Margin Rs 975/KL, Op. Cost Rs 246/KL, 15% minimum)</span></h4>
    <form id="budget-irr-form" class="form">
      <label>Volume envisaged (KL/month) <input name="incrementalVolumeKLPerMonth" type="number" step="0.1" value="${irr?.assumptions.incrementalVolumeKLPerMonth ?? 0}" required /></label>
      <label>Horizon (years) <input name="horizonYears" type="number" value="${irr?.assumptions.horizonYears ?? 10}" required /></label>
      <label>Gross margin (Rs/KL) <input name="grossMarginRsPerKL" type="number" value="${irr?.assumptions.grossMarginRsPerKL ?? 975}" required /></label>
      <label>Operating cost (Rs/KL) <input name="operatingCostRsPerKL" type="number" value="${irr?.assumptions.operatingCostRsPerKL ?? 246}" required /></label>
      <button type="submit" class="btn btn--sm">Compute / recompute IRR</button>
    </form>
    ${irr
        ? `<p>
      IRR: <strong>${irr.irrPct === null ? "not viable within horizon" : `${irr.irrPct.toFixed(1)}%`}</strong>
      vs minimum hurdle <strong>${irr.minimumHurdlePct}%</strong>
      <span class="badge badge--${irr.meetsHurdle ? "resolved" : "escalated"}">${irr.meetsHurdle ? "Meets hurdle" : "Below hurdle"}</span>
    </p>`
        : `<p class="muted">IRR not yet computed.</p>`}
  `);
    if (budget.status === "Draft") {
        sections.push(`<button id="budget-submit-btn" class="btn" ${irr ? "" : "disabled"}>Submit budget note for approval (AI)</button>`);
    }
    else {
        sections.push(`<pre class="ai-output">${escapeHtml(budget.noteText ?? "")}</pre><p>Status: <strong>${escapeHtml(budget.status)}</strong></p>`);
        if (budget.status === "Submitted") {
            sections.push(`
        <form id="budget-decision" class="form form--inline">
          <button type="submit" name="approve" value="1" class="btn">Approve</button>
          <button type="submit" name="approve" value="0" class="btn btn--danger">Reject</button>
        </form>`);
        }
    }
    return sections.join("");
}
const MODERNISATION_TYPE_LABELS = {
    Canopy: "Canopy",
    Driveway: "Driveway",
    DU: "Dispensing Unit (DU)",
    Tank: "Tank",
    ElectricPanel: "Electric Panel",
};
// Modernisation Request (Canopy/Driveway/DU/Tank/Electric Panel) — initiated by the dealer via
// Module 7 (Dealer Request Desk); reviewed here on the outlet's own page "for recommendation".
function renderModernisationSection(outletId, outletStatus, requests) {
    if (outletStatus !== "Operational") {
        return `<h3>Modernisation Requests</h3><p class="muted">Available once the outlet is operational.</p>`;
    }
    const parts = [
        `<h3>Modernisation Requests <span class="muted">(Canopy / Driveway / DU / Tank / Electric Panel)</span></h3>
     <p class="muted">Raised by the dealer via the Dealer Request Desk (Module 7). Each request sits here "for recommendation" until the SO adds a justification, verifies the cost estimate and IRR, and decides.</p>
     <p><a class="btn btn--sm" href="#/dealer-desk">Raise a new modernisation request &rarr;</a></p>`,
    ];
    if (!requests.length) {
        parts.push(`<p class="muted">No modernisation requests on file for this outlet yet.</p>`);
        return parts.join("");
    }
    for (const req of requests) {
        parts.push(renderOneModernisationRequest(outletId, req));
    }
    return parts.join("");
}
function renderOneModernisationRequest(outletId, req) {
    const ce = req.costEstimate;
    const irr = req.irr;
    const sections = [
        `<div class="panel" style="margin-top:1rem">
      <h4>${escapeHtml(MODERNISATION_TYPE_LABELS[req.modernisationType] ?? req.modernisationType)} — requested ${req.requestedAt.slice(0, 10)}</h4>
      <p>Dealer justification: ${escapeHtml(req.dealerJustification)}</p>`,
    ];
    sections.push(`
    <h5>Cost Estimate <span class="muted">(real HPCL standard rates — qty/rate editable)</span></h5>
    <form id="mod-cost-form-${req.id}" class="form">
      <table class="table">
        <thead><tr><th>Description</th><th>Bucket</th><th>Qty</th><th>UOM</th><th>Rate (Rs.)</th><th>Amount (Rs.)</th></tr></thead>
        <tbody>
          ${ce.lineItems
        .map((li) => `<tr>
            <td>${escapeHtml(li.description)}</td>
            <td>${li.depreciationBucket === "Civil" ? "Civil (10%)" : "Plant & Machinery (15%)"}</td>
            <td><input name="qty_${li.id}" type="number" step="0.01" value="${li.qty}" style="width:6rem" /></td>
            <td>${escapeHtml(li.uom)}</td>
            <td><input name="rate_${li.id}" type="number" step="0.01" value="${li.rate}" style="width:8rem" /></td>
            <td>Rs. ${li.amount.toLocaleString("en-IN")}</td>
          </tr>`)
        .join("")}
        </tbody>
      </table>
      <p>
        Subtotal: <strong>Rs. ${ce.subtotal.toLocaleString("en-IN")}</strong>
        (Civil Rs. ${ce.civilAmount.toLocaleString("en-IN")} + Plant &amp; Machinery Rs. ${ce.plantMachineryAmount.toLocaleString("en-IN")})
        &nbsp;|&nbsp; GST addback (${ce.gstRatePct}% &times; ${ce.gstNonCreditablePct}% non-creditable): <strong>Rs. ${ce.gstAddback.toLocaleString("en-IN")}</strong>
        &nbsp;|&nbsp; Total Investment: <strong>Rs. ${ce.totalInvestment.toLocaleString("en-IN")}</strong>
      </p>
      <button type="submit" class="btn btn--sm">Recompute cost estimate</button>
    </form>

    <h5>IRR <span class="muted">(WDV depreciation, real HQO circular rates — Gross Margin Rs 975/KL, Op. Cost Rs 246/KL, 15% minimum)</span></h5>
    <form id="mod-irr-form-${req.id}" class="form">
      <label>Incremental volume (KL/month) <input name="incrementalVolumeKLPerMonth" type="number" step="0.1" value="${irr?.assumptions.incrementalVolumeKLPerMonth ?? 0}" required /></label>
      <label>Horizon (years) <input name="horizonYears" type="number" value="${irr?.assumptions.horizonYears ?? 10}" required /></label>
      <label>Gross margin (Rs/KL) <input name="grossMarginRsPerKL" type="number" value="${irr?.assumptions.grossMarginRsPerKL ?? 975}" required /></label>
      <label>Operating cost (Rs/KL) <input name="operatingCostRsPerKL" type="number" value="${irr?.assumptions.operatingCostRsPerKL ?? 246}" required /></label>
      <button type="submit" class="btn btn--sm">Compute / recompute IRR</button>
    </form>
    ${irr
        ? `<p>
      IRR: <strong>${irr.irrPct === null ? "not viable within horizon" : `${irr.irrPct.toFixed(1)}%`}</strong>
      vs minimum hurdle <strong>${irr.minimumHurdlePct}%</strong>
      <span class="badge badge--${irr.meetsHurdle ? "resolved" : "escalated"}">${irr.meetsHurdle ? "Meets hurdle" : "Below hurdle"}</span>
    </p>`
        : `<p class="muted">IRR not yet computed.</p>`}
  `);
    if (!req.soDecision) {
        sections.push(`
      <h5>SO recommendation</h5>
      <form id="mod-justification-form-${req.id}" class="form">
        <label>SO justification <textarea name="soJustification" required>${escapeHtml(req.soJustification ?? "")}</textarea></label>
        <button type="submit" class="btn btn--sm">Save justification</button>
      </form>
      <form id="mod-decision-form-${req.id}" class="form">
        <label>Decided by <input name="decidedBy" required /></label>
        <label>Decision remarks <textarea name="justification" required></textarea></label>
        <div class="form--inline">
          <button type="submit" name="decision" value="Approved" class="btn">Approve</button>
          <button type="submit" name="decision" value="Rejected" class="btn btn--danger">Reject</button>
        </div>
      </form>`);
    }
    else {
        sections.push(`<p>SO decision: <strong>${escapeHtml(req.soDecision.decision)}</strong> by ${escapeHtml(req.soDecision.decidedBy)} — ${escapeHtml(req.soDecision.justification)}</p>`);
        if (req.fileNote) {
            sections.push(`
        <h5>File note</h5>
        <p class="muted">System ID: ${escapeHtml(req.fileNote.systemId)} · Initiated: ${escapeHtml(req.fileNote.initiatedOn)}</p>
        ${req.fileNote.routing
                .map((r) => `
          <div class="routing-stage">
            <p class="muted">${escapeHtml(r.role)} — ${escapeHtml(r.actorName)}, ${escapeHtml(r.actorTitle)} · ${r.timestamp.slice(0, 19).replace("T", " ")}</p>
            <p>${escapeHtml(r.remarks)}</p>
          </div>`)
                .join("")}
        <p><a class="btn btn--sm" href="/api/outlets/${outletId}/modernisation-requests/${req.id}/file-note.pdf" target="_blank">⬇ Download file note PDF</a></p>
      `);
        }
        if (req.budgetNoteText)
            sections.push(`<h5>Budget note</h5><pre class="ai-output">${escapeHtml(req.budgetNoteText)}</pre>`);
        if (req.eamStatus && req.eamStatus !== "Pending") {
            sections.push(`<p>EAM status: <strong>${escapeHtml(req.eamStatus)}</strong></p>`);
        }
        else if (req.eamStatus === "Pending") {
            sections.push(`
        <form id="mod-eam-form-${req.id}" class="form--inline">
          <button type="submit" name="approve" value="1" class="btn">Approve EAM</button>
          <button type="submit" name="approve" value="0" class="btn btn--danger">Reject EAM</button>
        </form>`);
        }
        if (req.weeklyPerformance?.length) {
            sections.push(`
        <h5>Weekly performance vs commitment</h5>
        <table class="table"><thead><tr><th>Week of</th><th>Committed</th><th>Actual</th><th>On track</th></tr></thead>
        <tbody>${req.weeklyPerformance.map((w) => `<tr><td>${w.weekOf}</td><td>${w.committedKL} KL</td><td>${w.actualKL} KL</td><td>${w.onTrack ? "✅" : "⚠️"}</td></tr>`).join("")}</tbody></table>`);
        }
        if (req.eamStatus === "Approved") {
            sections.push(`
        <form id="mod-weekly-form-${req.id}" class="form--inline">
          <input name="actualKL" type="number" placeholder="Actual KL this week" required />
          <button type="submit" class="btn">Record weekly check</button>
        </form>`);
        }
    }
    sections.push(`</div>`);
    return sections.join("");
}
function wireOutletModernisationHandlers(outletId, requests) {
    const on = (sel, handler) => {
        const el = document.querySelector(sel);
        if (el)
            handler(el);
    };
    for (const req of requests ?? []) {
        on(`#mod-cost-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const form = e.target;
            const lineItems = req.costEstimate.lineItems.map((li) => ({
                id: li.id,
                qty: Number(form.elements.namedItem(`qty_${li.id}`).value),
                rate: Number(form.elements.namedItem(`rate_${li.id}`).value),
            }));
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/cost-estimate`, { lineItems });
            toast("Cost estimate recomputed");
            await renderOutletDetail(outletId);
        }));
        on(`#mod-irr-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = formToObject(e.target);
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/irr`, {
                incrementalVolumeKLPerMonth: Number(data.incrementalVolumeKLPerMonth),
                horizonYears: Number(data.horizonYears),
                grossMarginRsPerKL: Number(data.grossMarginRsPerKL),
                operatingCostRsPerKL: Number(data.operatingCostRsPerKL),
            });
            toast("IRR recomputed");
            await renderOutletDetail(outletId);
        }));
        on(`#mod-justification-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = formToObject(e.target);
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/justification`, { soJustification: data["soJustification"] });
            toast("Justification saved");
            await renderOutletDetail(outletId);
        }));
        on(`#mod-decision-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitter = e.submitter;
            const data = formToObject(e.target);
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/decision`, {
                decision: submitter.value,
                justification: data["justification"],
                decidedBy: data["decidedBy"],
            });
            toast("Decision recorded");
            await renderOutletDetail(outletId);
        }));
        on(`#mod-eam-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitter = e.submitter;
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/eam`, { approve: submitter.value === "1" });
            toast("EAM decision recorded");
            await renderOutletDetail(outletId);
        }));
        on(`#mod-weekly-form-${req.id}`, (el) => el.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = formToObject(e.target);
            await api.post(`/outlets/${outletId}/modernisation-requests/${req.id}/weekly-check`, { actualKL: Number(data["actualKL"]) });
            toast("Weekly performance recorded");
            await renderOutletDetail(outletId);
        }));
    }
}
// ---------------------------------------------------------------------------
// ASC / LEC / FVC — real Dealer Selection Guidelines 2023 Annexure V / W1 / Y
// formats. Yes/No fields are dropdowns; every field already captured on the
// Application Form is auto-populated server-side from it (dealerWorkflow.ts),
// so these forms only ask the committee for its own findings.
// ---------------------------------------------------------------------------
const ASC_CHECKLIST = [
    { id: "1", particular: "Notarized Affidavit as per Appendix-XA/XB uploaded — all clauses per standard format present", applicability: "All" },
    { id: "2", particular: "All stamp papers for affidavits purchased in the name of the Deponent", applicability: "All" },
    { id: "3", particular: "Proof of Age uploaded — between 21 to 60 years (individual) / 3 years from registration (entity)", applicability: "All except FF" },
    { id: "4", particular: "Proof of educational qualification submitted", applicability: "All Individual applicant" },
    { id: "5", particular: "Copy of Layout / Site Map of the offered plot uploaded", applicability: "All" },
    { id: "6", particular: "Copy of Khasra / Khatouni confirming ownership status as on date of application", applicability: "All" },
    { id: "7", particular: "Copy of relevant land documents in support of ownership / lease rights uploaded", applicability: "All" },
    { id: "8", particular: "Affidavit as per Appendix-III (offer of land), if applicable, uploaded", applicability: "Wherever applicable" },
    { id: "9", particular: "Affidavit (Appendix-III) tendered by owner(s) on or before date of application", applicability: "Wherever applicable" },
    { id: "10", particular: "Land details in application match land ownership documents submitted", applicability: "All" },
    { id: "11", particular: "Applicant falls under Group 1 (Owned land) after verifying land documents", applicability: "For Group 1 applicants" },
    { id: "12", particular: "Applicant falls under Group 2 (Firm offer) after verifying land documents", applicability: "For Group 2 applicants" },
    { id: "13", particular: "In case of partnership, all partners have declared their details separately", applicability: "Partnership" },
    { id: "14", particular: "In case of partnership, eligibility documents of each partner uploaded", applicability: "Partnership" },
    { id: "15", particular: "In case of partnership, draft partnership deed uploaded", applicability: "Partnership" },
    { id: "16", particular: "Eligibility certificate for the category uploaded as applicable", applicability: "As per Category" },
    { id: "17", particular: "Authorization / Resolution declaring the authorized person uploaded", applicability: "All Non-Individual applicant" },
    { id: "18", particular: "Attested copy of Registration certificate / Certificate of Incorporation", applicability: "All Non-Individual applicant" },
    { id: "19", particular: "CA certificate certifying profits during the previous 3 financial years", applicability: "Registered Society / Company (excl. PACS)" },
];
const LEC_EVALUATION = [
    { id: "1a", criterion: "Offered land meets minimum frontage as specified in advertisement" },
    { id: "1b", criterion: "Offered land meets minimum depth (perpendicular to frontage, after leaving the ROW line)" },
    { id: "1c", criterion: "Offered land meets minimum area as specified in advertisement" },
    { id: "2", criterion: "Offered land is within advertised area / stretch" },
    { id: "3", criterion: "No High Tension line (> 11 KV) is passing over the offered land" },
    { id: "4", criterion: "Offered land meets NHAI norms (only where the plot abuts a National Highway)" },
];
const FVC_ITEMS = [
    { itemNo: 1, particularsToBeVerified: "Category (except for open)", documentsToBeVerified: "Certificates issued by the competent authority" },
    { itemNo: 2, particularsToBeVerified: "Status of applicant (Individual / Non-individual)", documentsToBeVerified: "Registration/incorporation certificate; photograph & signature verified" },
    { itemNo: 3, particularsToBeVerified: "Date of Birth / Date of incorporation", documentsToBeVerified: "10th Std. Certificate / Birth Certificate / Passport / Election ID / PAN / Aadhar" },
    { itemNo: 4, particularsToBeVerified: "Marital Status (individual applicants only)", documentsToBeVerified: "Notarized Affidavit (Appendix-XA) / Marriage Certificate" },
    { itemNo: 5, particularsToBeVerified: "Educational Qualification (individual applicants only)", documentsToBeVerified: "Certificate of qualification" },
    { itemNo: 6, particularsToBeVerified: "Verification of original land documents found suitable by LEC", documentsToBeVerified: "Land documents produced in original at FVC" },
    { itemNo: 7, particularsToBeVerified: "Verification of PAN used by applicant while registering", documentsToBeVerified: "PAN of applicant / entity & authorized person" },
    { itemNo: 8, particularsToBeVerified: "Proof of Authorized Person (for Non-Individual Entity)", documentsToBeVerified: "Authority letter & copy of Resolution" },
    { itemNo: 9, particularsToBeVerified: "Proof of Name Change", documentsToBeVerified: "Gazette Notification on name change" },
];
function yesNoSelect(name) {
    return `<select name="${name}"><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option></select>`;
}
/** ASC checklist items are frequently conditional on applicant type (Group/Partnership/Category/Non-Individual) — N.A. is a real, distinct answer from No. */
function ascAnswerSelect(name) {
    return `<select name="${name}"><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option><option value="N.A.">N.A.</option></select>`;
}
/** Upload input + "attached" status for a scanned/offline ASC/LEC/FVC report — kept for the record, no auto-fill (see recordInspectionUpload's doc comment). */
function renderInspectionUploadBlock(c, kind) {
    const upload = c.inspectionUploads?.[kind];
    return `
    <div class="inspection-upload">
      <label>Attach a scanned/offline ${kind.toUpperCase()} report (optional, for the record — reads real text out of PDF/DOCX/TXT/MD; a scanned image PDF has no text layer to read)
        <input class="inspection-upload-input" data-kind="${kind}" type="file" accept=".txt,.md,.pdf,.docx" />
      </label>
      ${upload
        ? `<p class="muted">Attached: <strong>${escapeHtml(upload.fileName)}</strong> — ${upload.uploadedAt.slice(0, 19).replace("T", " ")}</p>`
        : ""}
    </div>`;
}
function renderAscBlock(c) {
    const existing = c.inspections.asc;
    if (existing) {
        return `<div class="inspection"><h4>ASC — Application Scrutiny Committee</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre><p><a class="btn btn--sm" href="/api/cases/${c.id}/asc.pdf" target="_blank">⬇ Download ASC report PDF</a></p>${renderInspectionUploadBlock(c, "asc")}</div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>ASC — Application Scrutiny Committee</h4><p class="muted">Save the Application intake above first — ASC auto-populates from it.</p></div>`;
    }
    return `
    <div class="inspection">
      <h4>ASC — Application Scrutiny Committee <span class="muted">(Annexure V)</span></h4>
      ${renderInspectionUploadBlock(c, "asc")}
      <p class="muted">Application No. ${escapeHtml(c.application.applicationNo)} · ${escapeHtml(c.application.applicantName)} · Category ${escapeHtml(c.application.applicantCategory)} — auto-populated from the Application above.</p>
      <form id="asc-form" class="form">
        <label>Name of Regional Office <input name="regionalOfficeName" placeholder="e.g. GURGAON RETAIL REGIONAL OFFICE" /></label>
        <label>Location Sr. No. <input name="locationSrNo" /></label>
        <table class="table"><thead><tr><th>#</th><th>Particulars</th><th>Applicability</th><th>Answer</th></tr></thead>
        <tbody>${ASC_CHECKLIST.map((it) => `<tr><td>${it.id}</td><td>${escapeHtml(it.particular)}</td><td>${escapeHtml(it.applicability)}</td><td>${ascAnswerSelect(`item_${it.id}`)}</td></tr>`).join("")}</tbody></table>
        <label>Rectifiable deficiencies (one per line) <textarea name="rectifiable"></textarea></label>
        <label>Non-rectifiable deficiencies (one per line) <textarea name="nonRectifiable"></textarea></label>
        <label>Candidate is
          <select name="recommendation" required>
            <option value="">Select…</option>
            <option>Eligible</option>
            <option>Ineligible</option>
            <option>Eligible Subject to Rectification of Deficiencies</option>
            <option>To be considered under Group-3</option>
          </select>
        </label>
        <label>Signature with date — Member I <input name="member1" required /></label>
        <label>Signature with date — Member II <input name="member2" required /></label>
        <label>Signature of Officer at Division / Territory / Regional Office — Name <input name="reviewingOfficerName" /></label>
        <label>— Designation <input name="reviewingOfficerDesignation" /></label>
        <label>Signature with Name &amp; Designation of Officer In-Charge — Name <input name="officerInChargeName" /></label>
        <label>— Designation <input name="officerInChargeDesignation" /></label>
        <button type="submit" class="btn">Submit ASC</button>
      </form>
    </div>`;
}
function renderLecBlock(c) {
    const existing = c.inspections.lec;
    if (existing) {
        return `<div class="inspection"><h4>LEC — Land Evaluation Committee</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre><p><a class="btn btn--sm" href="/api/cases/${c.id}/lec.pdf" target="_blank">⬇ Download LEC report PDF</a></p>${renderInspectionUploadBlock(c, "lec")}</div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>LEC — Land Evaluation Committee</h4><p class="muted">Save the Application intake above first — LEC auto-populates from it.</p></div>`;
    }
    const a = c.application;
    return `
    <div class="inspection">
      <h4>LEC — Land Evaluation Committee <span class="muted">(Annexure W1)</span></h4>
      ${renderInspectionUploadBlock(c, "lec")}
      <p class="muted">Plot ${escapeHtml(a.landKhasraKhatouniNo)}, Village ${escapeHtml(a.revenueVillage)}, Tehsil ${escapeHtml(a.tehsil)} · Frontage ${a.frontageM}m &times; Depth ${a.depthM}m, Area ${a.areaSqM} sqm — auto-populated from the Application above.</p>
      <form id="lec-form" class="form">
        <label>Distance from prominent landmark (m) <input name="distanceFromLandmarkM" /></label>
        <label>Name of landmark <input name="landmarkName" /></label>
        <label>Distance of edge of land from centre line of road (m) <input name="distanceEdgeFromCenterLineM" /></label>
        <label>Width of Right of Way (ROW) of road (m) <input name="rowWidthM" /></label>
        <label>Name / No. of road abutting offered plot <input name="roadNameOrNo" /></label>
        <label>Lat/Long of a point within the offered plot <input name="latLong" placeholder="28.xxxx, 77.xxxx" /></label>
        <table class="table"><thead><tr><th>#</th><th>Evaluation parameter</th><th>Answer</th></tr></thead>
        <tbody>${LEC_EVALUATION.map((it) => `<tr><td>${it.id}</td><td>${escapeHtml(it.criterion)}</td><td>${yesNoSelect(`eval_${it.id}`)}</td></tr>`).join("")}</tbody></table>
        <label>Layout matches the Layout Drawing (Appendix-V) uploaded by applicant ${yesNoSelect("layoutMatches")}</label>
        <label>Deviation notes, if any <textarea name="layoutDeviationNotes"></textarea></label>
        <label>Recommendation of LEC — offered plot found suitable for development of a RO ${yesNoSelect("recommendationSuitable")}</label>
        <label>If not suitable, reasons (one per line) <textarea name="reasons"></textarea></label>
        <label>Member 1 <input name="member1" required /></label>
        <label>Member 2 <input name="member2" required /></label>
        <label>Member 3 (in case offered plot is on NH) <input name="member3" /></label>
        <button type="submit" class="btn">Submit LEC</button>
      </form>
    </div>`;
}
function renderFvcBlock(c) {
    const existing = c.inspections.fvc;
    if (existing) {
        return `<div class="inspection"><h4>FVC — Field Verification of Credentials</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre><p><a class="btn btn--sm" href="/api/cases/${c.id}/fvc.pdf" target="_blank">⬇ Download FVC report PDF</a></p>${renderInspectionUploadBlock(c, "fvc")}</div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>FVC — Field Verification of Credentials</h4><p class="muted">Save the Application intake above first — FVC auto-populates from it.</p></div>`;
    }
    return `
    <div class="inspection">
      <h4>FVC — Field Verification of Credentials <span class="muted">(Annexure Y)</span></h4>
      ${renderInspectionUploadBlock(c, "fvc")}
      <p class="muted">${escapeHtml(c.application.applicantName)}, ${escapeHtml(c.application.address)} — auto-populated from the Application above.</p>
      <form id="fvc-form" class="form">
        <table class="table"><thead><tr><th>#</th><th>Particulars to be verified</th><th>Documents to be verified</th><th>Provided?</th><th>Verified</th><th>Comments</th></tr></thead>
        <tbody>${FVC_ITEMS.map((it) => `<tr><td>${it.itemNo}</td><td>${escapeHtml(it.particularsToBeVerified)}</td><td>${escapeHtml(it.documentsToBeVerified)}</td>
            <td>${yesNoSelect(`fvc_${it.itemNo}_provided`)}</td>
            <td><select name="fvc_${it.itemNo}_verified"><option value="">—</option><option value="Correct">Correct</option><option value="Incorrect">Incorrect</option></select></td>
            <td><input name="fvc_${it.itemNo}_comments" /></td></tr>`).join("")}</tbody></table>
        <label>Any other remarks <textarea name="anyOtherRemarks"></textarea></label>
        <label>Member 1 <input name="member1" required /></label>
        <label>Member 2 <input name="member2" required /></label>
        <button type="submit" class="btn">Submit FVC</button>
      </form>
    </div>`;
}
function wireCaseHandlers(c) {
    const on = (sel, handler) => {
        const el = document.querySelector(sel);
        if (el)
            handler(el);
    };
    on("#asc-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const itemAnswers = {};
        for (const it of ASC_CHECKLIST)
            itemAnswers[it.id] = data[`item_${it.id}`] ?? "";
        await api.post(`/cases/${c.id}/inspections/asc`, {
            itemAnswers,
            rectifiableDeficiencies: (data["rectifiable"] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            nonRectifiableDeficiencies: (data["nonRectifiable"] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            recommendation: data["recommendation"],
            member1: data["member1"],
            member2: data["member2"],
            regionalOfficeName: data["regionalOfficeName"],
            locationSrNo: data["locationSrNo"],
            reviewingOfficerName: data["reviewingOfficerName"],
            reviewingOfficerDesignation: data["reviewingOfficerDesignation"],
            officerInChargeName: data["officerInChargeName"],
            officerInChargeDesignation: data["officerInChargeDesignation"],
        });
        toast("ASC recorded");
        await renderCaseDetail(c.id);
    }));
    on("#lec-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const evaluationAnswers = {};
        for (const it of LEC_EVALUATION)
            evaluationAnswers[it.id] = data[`eval_${it.id}`] ?? "";
        await api.post(`/cases/${c.id}/inspections/lec`, {
            evaluationAnswers,
            siteFields: {
                distanceFromLandmarkM: data["distanceFromLandmarkM"] ?? "",
                landmarkName: data["landmarkName"] ?? "",
                distanceEdgeFromCenterLineM: data["distanceEdgeFromCenterLineM"] ?? "",
                rowWidthM: data["rowWidthM"] ?? "",
                roadNameOrNo: data["roadNameOrNo"] ?? "",
                latLong: data["latLong"] ?? "",
            },
            layoutMatchesApplication: data["layoutMatches"],
            layoutDeviationNotes: data["layoutDeviationNotes"] ?? "",
            recommendationSuitable: data["recommendationSuitable"],
            reasonsIfNotSuitable: (data["reasons"] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            member1: data["member1"],
            member2: data["member2"],
            member3: data["member3"] ?? "",
        });
        toast("LEC recorded");
        await renderCaseDetail(c.id);
    }));
    on("#fvc-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const itemAnswers = {};
        for (const it of FVC_ITEMS) {
            itemAnswers[it.itemNo] = {
                documentsProvidedByApplicant: data[`fvc_${it.itemNo}_provided`] ?? "",
                verifiedCorrect: data[`fvc_${it.itemNo}_verified`] ?? "",
                comments: data[`fvc_${it.itemNo}_comments`] ?? "",
            };
        }
        await api.post(`/cases/${c.id}/inspections/fvc`, {
            itemAnswers,
            anyOtherRemarks: data["anyOtherRemarks"] ?? "",
            member1: data["member1"],
            member2: data["member2"],
        });
        toast("FVC recorded");
        await renderCaseDetail(c.id);
    }));
    on("#committee-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/resitement/committee`, { name: data["name"], designation: data["designation"] });
        toast("Committee member added");
        await renderCaseDetail(c.id);
    }));
    on("#gen-tech-eval", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/resitement/technical-evaluation`);
        toast("Technical evaluation report generated");
        await renderCaseDetail(c.id);
    }));
    on("#interested-applicant-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/interested-applicants`, {
            name: data["name"],
            stretchName: data["stretchName"] ?? "",
            landDetails: data["landDetails"] ?? "",
            category: data["category"] ?? "",
            mobileNo: data["mobileNo"] ?? "",
        });
        toast("Interested applicant added");
        await renderCaseDetail(c.id);
    }));
    on("#roster-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const entries = (data["lines"] ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
            const [candidateName, location, priority, feasible, remarks] = l.split("|").map((s) => s.trim());
            return {
                candidateName: candidateName ?? "",
                location: location ?? "",
                priority: Number(priority) || 1,
                feasible: /^y/i.test(feasible ?? ""),
                remarks: remarks ?? "",
            };
        });
        await api.post(`/cases/${c.id}/roster`, { entries });
        toast("Roster saved");
        await renderCaseDetail(c.id);
    }));
    on("#feasibility-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const tradingAreaPotential = (data.taLines ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
            const [roName, distance, oilCo, ms, hsd] = l.split("|").map((s) => s.trim());
            return {
                roName: roName ?? "",
                distanceFromProposedKm: distance ? Number(distance) : undefined,
                oilCo: oilCo ?? "",
                msKLPM: Number(ms) || 0,
                hsdKLPM: Number(hsd) || 0,
            };
        });
        const numericFields = [
            "expectedTrafficGrowthPct",
            "presentTAGrowthMsKLPM",
            "presentTAGrowthHsdKLPM",
            "expectedTAGrowthMsPct",
            "expectedTAGrowthHsdPct",
            "expectedTAPotentialMsKLPM",
            "expectedTAPotentialHsdKLPM",
            "estimatedSalesYear1Ms",
            "estimatedSalesYear1Hsd",
            "estimatedSalesYear2Ms",
            "estimatedSalesYear2Hsd",
            "estimatedSalesYear3Ms",
            "estimatedSalesYear3Hsd",
        ];
        const body = { ...data, tradingAreaPotential };
        delete body["taLines"];
        for (const f of numericFields)
            body[f] = Number(data[f]) || 0;
        await api.post(`/cases/${c.id}/feasibility-form`, body);
        toast("Feasibility report generated");
        await renderCaseDetail(c.id);
    }));
    on("#application-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/application`, {
            ...data,
            frontageM: Number(data.frontageM) || 0,
            depthM: Number(data.depthM) || 0,
            areaSqM: Number(data.areaSqM) || 0,
            otherFields: {},
        });
        toast("Application saved");
        await renderCaseDetail(c.id);
    }));
    qsa(".inspection-upload-input").forEach((el) => el.addEventListener("change", async (e) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file)
            return;
        const kind = input.dataset["kind"];
        const isBinary = /\.(pdf|docx)$/i.test(file.name);
        const body = isBinary ? { base64: await fileToBase64(file), fileName: file.name } : { text: await file.text(), fileName: file.name };
        await api.post(`/cases/${c.id}/inspections/${kind}/upload`, body);
        toast(`${kind?.toUpperCase()} report attached`);
        await renderCaseDetail(c.id);
    }));
    on("#application-upload", (el) => el.addEventListener("change", async (e) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file)
            return;
        const isBinary = /\.(pdf|docx)$/i.test(file.name);
        const body = isBinary ? { base64: await fileToBase64(file), fileName: file.name } : { text: await file.text(), fileName: file.name };
        const result = await api.post(`/cases/${c.id}/application/extract`, body);
        const warningsEl = document.querySelector("#application-upload-warnings");
        if (warningsEl)
            warningsEl.innerHTML = result.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join("");
        const form = document.querySelector("#application-form");
        if (!form)
            return;
        for (const [field, value] of Object.entries(result.fields)) {
            const control = form.elements.namedItem(field);
            if (control)
                control.value = String(value);
        }
        if (Object.keys(result.fields).length)
            toast(`Pre-filled ${Object.keys(result.fields).length} field(s) — review before saving`);
    }));
    on("#file-note-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const activities = (data.activityLines ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
            const [activity, date, team, result, attachment] = l.split("|").map((s) => s.trim());
            return { activity: activity ?? "", date: date ?? "", team: team ?? "", result: result ?? "", attachment: attachment ?? "" };
        });
        const annexureList = (data.annexureListLines ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        const body = { ...data, activities, annexureList };
        delete body["activityLines"];
        delete body["annexureListLines"];
        body["ascCommitteeSize"] = Number(data.ascCommitteeSize) || 0;
        await api.post(`/cases/${c.id}/file-note-form`, body);
        toast("File note generated");
        await renderCaseDetail(c.id);
    }));
    on("#filenote-decision", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/file-note/decision`, {
            approve: submitter.value === "1",
            approvedBy: data["approvedBy"],
            actorTitle: data["actorTitle"],
            remarks: data["remarks"],
        });
        toast("File note decision recorded");
        await renderCaseDetail(c.id);
    }));
    on("#gen-loi", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/loi`);
        toast("LOI generated");
        await renderCaseDetail(c.id);
    }));
    qsa(".milestone-form").forEach((el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const key = form.dataset["key"];
        const data = formToObject(form);
        await api.post(`/cases/${c.id}/milestones/${key}`, { status: data["status"], notes: data["notes"] });
        toast("Milestone updated");
        await renderCaseDetail(c.id);
    }));
    on("#add-milestone-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/milestones`, { label: data["label"] });
        toast("Milestone added");
        await renderCaseDetail(c.id);
    }));
    on("#sync-customer", (el) => el.addEventListener("click", async () => {
        try {
            await api.post(`/cases/${c.id}/customer-master-sync`);
            toast("Synced to MDM & SAP");
            await renderCaseDetail(c.id);
        }
        catch (err) {
            toast(err.message, "error");
        }
    }));
    on("#budget-cost-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const lineItems = [];
        for (const input of Array.from(form.querySelectorAll('input[name^="qty_"]'))) {
            const name = input.name;
            const id = name.slice(4);
            const rateInput = form.elements.namedItem(`rate_${id}`);
            lineItems.push({ id, qty: Number(input.value), rate: rateInput ? Number(rateInput.value) : 0 });
        }
        await api.post(`/cases/${c.id}/budget/cost-estimate`, { lineItems });
        toast("Cost estimate recomputed");
        await renderCaseDetail(c.id);
    }));
    on("#budget-irr-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/budget/irr`, {
            incrementalVolumeKLPerMonth: Number(data.incrementalVolumeKLPerMonth),
            horizonYears: Number(data.horizonYears),
            grossMarginRsPerKL: Number(data.grossMarginRsPerKL),
            operatingCostRsPerKL: Number(data.operatingCostRsPerKL),
        });
        toast("IRR recomputed");
        await renderCaseDetail(c.id);
    }));
    on("#budget-submit-btn", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/budget/submit`);
        toast("Budget note generated");
        await renderCaseDetail(c.id);
    }));
    on("#budget-decision", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        await api.post(`/cases/${c.id}/budget/decision`, { approve: submitter.value === "1" });
        toast("Budget decision recorded");
        await renderCaseDetail(c.id);
    }));
    on("#commission-btn", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/commission`);
        toast("Outlet commissioned — nozzle sales started");
        await renderCaseDetail(c.id);
    }));
}
// ---------------------------------------------------------------------------
// Module 3 — Predictive Analysis
// ---------------------------------------------------------------------------
async function renderAnalytics(salesSummaryOutletId) {
    const [summary, outlets, salesSummary, growth] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/outlets"),
        api.get(`/analytics/sales-area-summary${salesSummaryOutletId ? `?outletId=${salesSummaryOutletId}` : ""}`),
        api.get("/analytics/growth"),
    ]);
    app().innerHTML = `
    <section class="panel">
      <h2>Predictive Analysis</h2>
      <p class="muted">Sales feed shown as fetched from CRIS. Analytical dashboard for the Sales Officer — ask anything.</p>

      <h3>Sales Area Summary <span class="muted">(real data — current month &amp; year to date)</span></h3>
      <label>Scope
        <select id="sales-summary-outlet-select">
          <option value="">All outlets (Faridabad SA)</option>
          ${outlets.map((o) => `<option value="${o.id}" ${o.id === salesSummaryOutletId ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
        </select>
      </label>
      ${renderSalesAreaSummarySection(salesSummary)}

      ${renderGrowthAnalysisSection(growth)}

      <div class="grid-cards">
        <div class="card"><h3>Below TA average</h3><p class="big">${summary.belowTA.length}</p><ul>${summary.belowTA.map((x) => `<li>${escapeHtml(x.name)}: ${x.actualKL} / ${x.taAverageKL} KL</li>`).join("")}</ul></div>
        <div class="card"><h3>Dry today</h3><p class="big">${summary.dryToday.length}</p><ul>${summary.dryToday.map((x) => `<li>${escapeHtml(x.name)}</li>`).join("")}</ul></div>
        <div class="card"><h3>Low on tank stock now <span class="muted">(live SAP feed)</span></h3><p class="big">${summary.lowOnStockToday.length}</p><ul>${summary.lowOnStockToday.map((x) => `<li>${escapeHtml(x.name)}: ${x.products.map((p) => `${escapeHtml(p.product)} ${p.pct}%`).join(", ")}</li>`).join("") || "<li class='muted'>None</li>"}</ul></div>
        <div class="card"><h3>Frequently dry (60d)</h3><p class="big">${summary.frequentlyDry.length}</p><ul>${summary.frequentlyDry.map((x) => `<li>${escapeHtml(x.name)}: ${x.dryDays} days</li>`).join("")}</ul></div>
        <div class="card"><h3>MS &gt;100KL / HSD &lt;10KL (30d)</h3><p class="big">${summary.highMsLowHsd.length}</p><ul>${summary.highMsLowHsd.map((x) => `<li>${escapeHtml(x.name)}: MS ${x.msKL} / HSD ${x.hsdKL}</li>`).join("")}</ul></div>
      </div>

      <h3>Ask the analytics dashboard</h3>
      <div class="form--inline">
        <button class="btn btn--sm" data-q="How many outlets are doing below TA average?">Below TA average?</button>
        <button class="btn btn--sm" data-q="Which outlets are dry today?">Dry today?</button>
        <button class="btn btn--sm" data-q="Which outlets are low on tank stock right now?">Low on tank stock now?</button>
        <button class="btn btn--sm" data-q="Which outlets are selling more than 100 KL MS but less than 10 KL HSD?">MS/HSD skew?</button>
      </div>
      <form id="ask-form" class="form--inline">
        <input name="question" placeholder="Ask anything about outlet performance..." style="flex:1" />
        <button type="submit" class="btn">Ask</button>
      </form>
      <div id="ask-answer"></div>
    </section>`;
    const ask = async (question) => {
        const res = await api.post("/analytics/ask", { question });
        qs("#ask-answer").innerHTML = `<div class="ai-output">${escapeHtml(res.answer)}</div>`;
    };
    qsa("[data-q]").forEach((btn) => btn.addEventListener("click", () => ask(btn.dataset["q"])));
    qs("#ask-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        if (data["question"])
            await ask(data["question"]);
    });
    qs("#sales-summary-outlet-select").addEventListener("change", (e) => {
        const id = e.target.value;
        renderAnalytics(id || undefined);
    });
}
/** "No CY data on file" (Power) reads better than a bare "-" which could be mistaken for a real zero. */
function fmtAchieved(n) {
    return n != null ? n.toFixed(2) : "No CY data";
}
/** A handful of dealers in the real Trading Area report have no figures on file for a given month — show that plainly rather than a fabricated 0. */
function fmtKL(n) {
    return n != null ? n.toFixed(1) : "—";
}
function fmtPct(n) {
    return n != null ? `${n.toFixed(1)}%` : "—";
}
function renderSalesAreaSummarySection(rows) {
    if (!rows.length)
        return `<p class="muted">No real DSR data on file for this scope yet.</p>`;
    return `
    <table class="table">
      <thead><tr><th>Product</th><th colspan="3">Current month (${escapeHtml(rows[0].currentMonthLabel)})</th><th colspan="3">Year to date</th></tr>
      <tr><th></th><th>Target (LY)</th><th>Achieved</th><th>% Covered</th><th>Target (LY)</th><th>Achieved</th><th>% Covered</th></tr></thead>
      <tbody>
        ${rows
        .map((r) => `<tr>
          <td>${escapeHtml(r.product)} <span class="muted">(${escapeHtml(r.unit)})</span></td>
          <td>${r.currentMonth.target.toFixed(2)}</td>
          <td>${fmtAchieved(r.currentMonth.achieved)}</td>
          <td>${r.currentMonth.coveragePct != null ? `${r.currentMonth.coveragePct}%` : "-"}</td>
          <td>${r.yearToDate.target.toFixed(2)}</td>
          <td>${fmtAchieved(r.yearToDate.achieved)}</td>
          <td>${r.yearToDate.coveragePct != null ? `${r.yearToDate.coveragePct}%` : "-"}</td>
        </tr>`)
        .join("")}
      </tbody>
    </table>`;
}
function growthBadge(g) {
    if (g.direction === "no-data")
        return `<span class="muted">No CY data</span>`;
    const sign = g.growthPct >= 0 ? "+" : "";
    const cls = g.direction === "up" ? "text--up" : g.direction === "down" ? "text--down" : "muted";
    return `<span class="${cls}">${sign}${g.growthPct}%</span>`;
}
/**
 * Per-outlet MS/HSD/Power growth or degrowth (latest real month vs the same month last year),
 * paired with the real DU transaction-log slab-mix trend and uptime signal where a transaction
 * log exists for that outlet — the two use different time windows (YoY vs the log's own Feb-2026
 * onward history), so the slab trend is a real, suggestive signal for "why", not a rigorous
 * decomposition of the YoY number; the text says so rather than overclaiming.
 */
function renderGrowthAnalysisSection(growth) {
    const { caveat, reports } = growth;
    if (!reports.length)
        return "";
    return `
    <h3>Outlet volume growth / degrowth — MS, HSD, Power <span class="muted">(latest month on file vs the same month last year)</span></h3>
    <p class="panel--error">⚠ ${escapeHtml(caveat)}</p>
    ${reports
        .map((g) => `
      <div class="card">
        <h3><a href="#/outlets/${g.outletId}">${escapeHtml(g.outletName)}</a></h3>
        <table class="table">
          <thead><tr><th>Product</th><th>Month</th><th>LY (target)</th><th>CY (achieved)</th><th>Growth</th></tr></thead>
          <tbody>${g.products
        .map((p) => `<tr>
            <td>${escapeHtml(p.product)}</td>
            <td>${escapeHtml(p.month)}</td>
            <td>${p.target.toFixed(2)} ${escapeHtml(p.unit)}</td>
            <td>${p.achieved != null ? `${p.achieved.toFixed(2)} ${escapeHtml(p.unit)}` : "No CY data"}</td>
            <td>${growthBadge(p)}</td>
          </tr>`)
        .join("")}</tbody>
        </table>
        <p class="muted"><strong>Why (real transaction-slab trend):</strong>${g.hasTransactionLog
        ? ""
        : ` ${escapeHtml(g.slabNarrative[0])}`}</p>
        ${g.hasTransactionLog ? `<ul>${g.slabNarrative.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
        <p class="muted"><strong>DU uptime:</strong> ${g.duUptime
        ? `${g.duUptime.uptimePct}% (${g.duUptime.daysOnFile}/${g.duUptime.totalDays} days on file)${g.duUptime.gaps.length
            ? " — gaps: " + g.duUptime.gaps.map((gap) => `${gap.startDate} to ${gap.endDate} (${gap.days}d)`).join(", ")
            : ""}`
        : "No DU transaction log on file for this outlet."}${g.inactiveNozzleCount > 0 ? ` · ⚠ ${g.inactiveNozzleCount} nozzle(s) currently look inactive.` : ""}</p>
      </div>`)
        .join("")}
  `;
}
// ---------------------------------------------------------------------------
// Module 4 — Teams Communication
// ---------------------------------------------------------------------------
async function renderTeams(kpiOutletId) {
    const [team, tasks, notes, openWork, outlets, cases, kpi] = await Promise.all([
        api.get("/team"),
        api.get("/tasks"),
        api.get("/memory-notes"),
        api.get("/teams/open-workflows"),
        api.get("/outlets"),
        api.get("/cases"),
        api.get(`/kpi-tracker${kpiOutletId ? `?outletId=${kpiOutletId}` : ""}`),
    ]);
    const memberName = (id) => team.find((t) => t.id === id)?.name ?? id;
    app().innerHTML = `
    <section class="panel">
      <h2>Teams Communication</h2>
      <p class="muted">Sales-area summary, KPI tracker, task assignment, open workflows &amp; proposals.</p>

      <h3>KPI Tracker <span class="muted">(target = real last-year actual, achieved = this year to date)</span></h3>
      <label>Scope
        <select id="kpi-outlet-select">
          <option value="">All outlets (Faridabad SA)</option>
          ${outlets.map((o) => `<option value="${o.id}" ${o.id === kpiOutletId ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
        </select>
      </label>
      ${renderKpiTrackerSection(kpi)}

      <h3>Open cases in progress</h3>
      <ul>
        ${openWork.openCases.map((c) => `<li><a href="#/cases/${c.id}">${escapeHtml(c.stretchName)}</a> — <span class="badge">${escapeHtml(c.stage)}</span></li>`).join("") || "<li>No open cases.</li>"}
      </ul>

      <h3>Open workflows &amp; proposals awaiting approval</h3>
      <ul>
        ${openWork.proposalsAwaitingApproval.map((p) => `<li><a href="#/cases/${p.caseId}">${escapeHtml(p.stretchName)}</a> — ${escapeHtml(p.awaiting)}</li>`).join("")}
        ${openWork.modernisationProposalsAwaitingApproval.map((p) => `<li><a href="#/outlets/${p.outletId}">${escapeHtml(p.outletName)}</a> — ${escapeHtml(p.modernisationType)}: ${escapeHtml(p.awaiting)}</li>`).join("")}
        ${!openWork.proposalsAwaitingApproval.length && !openWork.modernisationProposalsAwaitingApproval.length ? "<li>Nothing awaiting approval.</li>" : ""}
      </ul>
      ${openWork.stuckMilestones.length ? `<p class="warn">⚠️ Stuck: ${openWork.stuckMilestones.map((m) => `<a href="#/cases/${m.caseId}">${escapeHtml(m.stretchName)} — ${escapeHtml(m.milestoneLabel)}</a>`).join(", ")}</p>` : ""}

      <h3>Critical / High dealer requests <span class="muted">(Module 7)</span></h3>
      <ul>
        ${openWork.criticalDealerRequests.map((r) => `<li><span class="badge badge--${r.criticality.toLowerCase()}">${escapeHtml(r.criticality)}</span> <a href="#/dealer-desk/${r.id}">${escapeHtml(r.category)} — ${escapeHtml(r.subject)}</a> (${escapeHtml(r.status)})</li>`).join("") || "<li>None open.</li>"}
      </ul>

      <h3>Task board</h3>
      <table class="table">
        <thead><tr><th>Title</th><th>Assigned to</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead>
        <tbody>${tasks
        .map((t) => `<tr>
          <td>${taskTitleHtml(t)}</td>
          <td>${escapeHtml(memberName(t.assignedTo))}</td>
          <td>${escapeHtml(t.dueDate)}</td>
          <td>${escapeHtml(t.priority)}</td>
          <td>${escapeHtml(t.status)}</td>
          <td>${t.status !== "Done" ? `<button class="btn btn--sm" data-done="${t.id}">Mark done</button>` : ""}</td>
        </tr>`)
        .join("")}</tbody>
      </table>

      <h3>Assign a new task</h3>
      <form id="task-form" class="form">
        <label>Title <input name="title" required /></label>
        <label>Description <textarea name="description"></textarea></label>
        <label>Assign to
          <select name="assignedTo">${team.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}</select>
        </label>
        <label>Assigned by
          <select name="assignedBy">${team.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}</select>
        </label>
        <label>Due date <input name="dueDate" type="date" required /></label>
        <label>Priority
          <select name="priority"><option>High</option><option>Medium</option><option>Low</option></select>
        </label>
        <label>Link to
          <select name="linkedModule" id="link-module-select">
            <option value="">None</option>
            <option value="Outlet">Outlet</option>
            <option value="DealerCase">Dealer Case</option>
          </select>
        </label>
        <label>Linked record
          <select name="linkedRecordId" id="link-record-select" disabled>
            <option value="">—</option>
          </select>
        </label>
        <label><input type="checkbox" name="urgent" /> Urgent</label>
        <label><input type="checkbox" name="important" /> Important</label>
        <button type="submit" class="btn">Create task</button>
      </form>

      <h3>Shared memory notes</h3>
      <ul>${notes.map((n) => `<li><strong>${escapeHtml(n.author)}</strong> (${n.date.slice(0, 10)}): ${escapeHtml(n.text)}</li>`).join("") || "<li>No notes yet.</li>"}</ul>
      <form id="note-form" class="form--inline">
        <input name="author" placeholder="Your name" required />
        <input name="text" placeholder="Note..." style="flex:1" required />
        <button type="submit" class="btn">Add note</button>
      </form>
    </section>`;
    qsa("[data-done]").forEach((btn) => btn.addEventListener("click", async () => {
        await api.put(`/tasks/${btn.dataset["done"]}`, { status: "Done" });
        toast("Task marked done");
        await renderTeams();
    }));
    const linkOptionsByModule = {
        Outlet: outlets.map((o) => ({ value: o.id, label: o.name })),
        DealerCase: cases.map((c) => ({ value: c.id, label: c.stretchName })),
    };
    qs("#link-module-select").addEventListener("change", (e) => {
        const moduleKey = e.target.value;
        const recordSelect = qs("#link-record-select");
        const options = linkOptionsByModule[moduleKey] ?? [];
        recordSelect.disabled = options.length === 0;
        recordSelect.innerHTML = options.length
            ? options.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")
            : `<option value="">—</option>`;
    });
    qs("#task-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = formToObject(form);
        if (!data.linkedModule) {
            delete data.linkedModule;
            delete data.linkedRecordId;
        }
        await api.post("/tasks", {
            ...data,
            urgent: form.querySelector('[name="urgent"]').checked,
            important: form.querySelector('[name="important"]').checked,
        });
        toast("Task created");
        await renderTeams();
    });
    qs("#note-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post("/memory-notes", { author: data["author"], text: data["text"], tags: [] });
        toast("Note saved");
        await renderTeams();
    });
    qs("#kpi-outlet-select").addEventListener("change", (e) => {
        const id = e.target.value;
        renderTeams(id || undefined);
    });
}
function renderKpiTrackerSection(kpi) {
    if (!kpi.length)
        return `<p class="muted">No real DSR data on file for this scope yet.</p>`;
    return kpi
        .map((p) => `
    <h4>${escapeHtml(p.product)} <span class="muted">(${p.unit})</span></h4>
    ${renderLineChartSVG(p.months.map((m) => m.label), [
        { name: "Target (LY)", color: "#eb6834", values: p.months.map((m) => m.target) },
        { name: "Achieved (CY)", color: "#0057a8", values: p.months.map((m) => m.achieved) },
    ], { unit: p.unit })}
    <table class="table">
      <thead><tr><th>Month</th><th>Target (LY)</th><th>Achieved (CY)</th><th>% Covered</th></tr></thead>
      <tbody>
        ${p.months
        .map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${m.target.toFixed(2)}</td><td>${fmtAchieved(m.achieved)}</td><td>${m.coveragePct != null ? `${m.coveragePct}%` : "-"}</td></tr>`)
        .join("")}
        <tr><td><strong>YoY (to date)</strong></td><td><strong>${p.yoyTarget.toFixed(2)}</strong></td><td><strong>${fmtAchieved(p.yoyAchieved)}</strong></td><td><strong>${p.yoyCoveragePct != null ? `${p.yoyCoveragePct}%` : "-"}</strong></td></tr>
      </tbody>
    </table>`)
        .join("");
}
// ---------------------------------------------------------------------------
// Module 5 — SO Cockpit
// ---------------------------------------------------------------------------
async function renderCockpit() {
    const snap = await api.get("/cockpit");
    const q = snap.quadrants;
    app().innerHTML = `
    <section class="panel">
      <h2>SO Cockpit</h2>
      <p class="muted">Guiding module — tasks from Modules 1-4, divided into four quadrants (7 Habits time-management matrix), plus a circuit-wise pending calendar.</p>

      <div class="grid-quadrants">
        ${["DoFirst", "Schedule", "Delegate", "Eliminate"]
        .map((k) => `
          <div class="quadrant quadrant--${k}">
            <h3>${escapeHtml(q[k].label)}</h3>
            <ul>${q[k].tasks.map((t) => `<li>${taskTitleHtml(t)} <span class="muted">(due ${t.dueDate})</span></li>`).join("") || "<li class='muted'>Nothing here.</li>"}</ul>
          </div>`)
        .join("")}
      </div>

      <h3>Circuit / town-wise pending calendar</h3>
      <table class="table">
        <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Sales Area</th></tr></thead>
        <tbody>${snap.calendar
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => `<tr><td>${e.date}</td><td>${escapeHtml(e.type)}</td><td>${e.linkedCaseId ? `<a href="#/cases/${e.linkedCaseId}">${escapeHtml(e.title)}</a>` : escapeHtml(e.title)}</td><td>${escapeHtml(e.salesArea)}</td></tr>`)
        .join("") || "<tr><td colspan='4'>Calendar is clear.</td></tr>"}</tbody>
      </table>

      <h3>Completed work — calendar record <span class="muted">(dropped off the to-do lists above the moment they're marked Done)</span></h3>
      <label>Browse by date
        <select id="completed-date-select">
          <option value="">All dates</option>
          ${snap.completedLog.map((g) => `<option value="${g.date}">${g.date} (${g.items.length})</option>`).join("")}
        </select>
      </label>
      <div id="completed-log">${renderCompletedLog(snap.completedLog)}</div>
    </section>`;
    qs("#completed-date-select").addEventListener("change", (e) => {
        const date = e.target.value;
        const filtered = date ? snap.completedLog.filter((g) => g.date === date) : snap.completedLog;
        qs("#completed-log").innerHTML = renderCompletedLog(filtered);
    });
}
function renderCompletedLog(groups) {
    if (!groups.length)
        return `<p class="muted">Nothing marked done yet.</p>`;
    return groups
        .map((g) => `
    <h4>${escapeHtml(g.date)}</h4>
    <ul>${g.items
        .map((it) => {
        const href = linkedRecordHref(it.linkedModule, it.linkedRecordId);
        const label = href ? `<a href="${href}">${escapeHtml(it.title)}</a>` : escapeHtml(it.title);
        return `<li>${label} <span class="muted">(${escapeHtml(it.source)}, completed ${it.completedAt.slice(11, 16)})</span></li>`;
    })
        .join("")}</ul>`)
        .join("");
}
// ---------------------------------------------------------------------------
// Module 6 — Knowledge Centre
// ---------------------------------------------------------------------------
async function renderKnowledge() {
    app().innerHTML = `
    <section class="panel">
      <h2>Knowledge Centre — Policy Bot</h2>
      <p class="muted">Ask a question; the bot cites the relevant clause. Also auto-invoked when Module 2 drafts file notes.</p>

      <form id="ask-policy-form" class="form--inline">
        <input name="question" placeholder="e.g. What is the minimum land area for a highway outlet?" style="flex:1" required />
        <button type="submit" class="btn">Ask</button>
      </form>
      <div id="policy-answer"></div>

      <h3>Add a policy clause</h3>
      <form id="add-policy-form" class="form">
        <label>Document title <input name="documentTitle" required /></label>
        <label>Clause number <input name="clauseNumber" /></label>
        <label>Heading <input name="heading" required /></label>
        <label>Clause text <textarea name="text" required></textarea></label>
        <label>Tags (comma-separated) <input name="tagsRaw" /></label>
        <button type="submit" class="btn">Add clause</button>
      </form>
    </section>`;
    qs("#ask-policy-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        const res = await api.post("/knowledge/ask", { question: data["question"] });
        qs("#policy-answer").innerHTML = `
      <div class="ai-output">${escapeHtml(res.answer)}</div>
      ${res.matchedClauses.length ? `<h4>References</h4><ul>${res.matchedClauses.map((c) => `<li>${escapeHtml(c.documentTitle)} ${escapeHtml(c.clauseNumber)} — ${escapeHtml(c.heading)}</li>`).join("")}</ul>` : ""}`;
    });
    qs("#add-policy-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post("/policy-clauses", {
            documentTitle: data["documentTitle"],
            clauseNumber: data["clauseNumber"],
            heading: data["heading"],
            text: data["text"],
            tags: (data["tagsRaw"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        });
        toast("Clause added");
        await renderKnowledge();
    });
}
// ---------------------------------------------------------------------------
// Module 7 — Dealer Request Desk
// ---------------------------------------------------------------------------
const DEALER_REQUEST_CATEGORIES = [
    { value: "ROMMS", label: "ROMMS complaint" },
    { value: "ITPS", label: "ITPS / tank-gauging not working" },
    { value: "SMS", label: "SMS / price-alert not going" },
    { value: "MarketIntelligence", label: "Market intelligence" },
    { value: "Modernisation", label: "Modernisation request (Canopy/Driveway/DU/Tank/Electric Panel)" },
    { value: "Other", label: "Other" },
];
const MODERNISATION_TYPE_OPTIONS = [
    { value: "Canopy", label: "Canopy" },
    { value: "Driveway", label: "Driveway" },
    { value: "DU", label: "DU (Dispensing Unit)" },
    { value: "Tank", label: "Tank" },
    { value: "ElectricPanel", label: "Electric Panel" },
];
const SO_PRIORITY_OPTIONS = [
    { value: "HighlyCritical", label: "Highly Critical" },
    { value: "Critical", label: "Critical" },
    { value: "HighImportance", label: "High Importance" },
    { value: "MediumImportance", label: "Medium Importance" },
    { value: "LowImportance", label: "Low Importance" },
];
const STAKEHOLDER_OPTIONS = [
    { value: "ManagerEngineering", label: "Manager Engineering" },
    { value: "MISOfficer", label: "MIS Officer" },
    { value: "FinanceOfficer", label: "Finance Officer" },
    { value: "DepotTerminalOfficer", label: "Depot/Terminal Officer" },
];
function soPriorityBadge(soPriority) {
    if (!soPriority)
        return "";
    const label = SO_PRIORITY_OPTIONS.find((p) => p.value === soPriority)?.label ?? soPriority;
    return `<span class="badge badge--${soPriority.toLowerCase()}">SO priority: ${escapeHtml(label)}</span>`;
}
function requestRaiseForm(outlets, outletId) {
    return `
    <form id="dealer-request-form" class="form">
      <label>Outlet
        <select name="outletId" required>${outlets.map((o) => `<option value="${o.id}" ${o.id === outletId ? "selected" : ""}>${escapeHtml(o.name)} (${escapeHtml(o.dealerName ?? "no dealer on file")})</option>`).join("")}</select>
      </label>
      <label>Category
        <select name="category" id="dealer-request-category">${DEALER_REQUEST_CATEGORIES.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join("")}</select>
      </label>
      <label id="modernisation-type-field" style="display:none">Modernisation type
        <select name="modernisationType">${MODERNISATION_TYPE_OPTIONS.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}</select>
      </label>
      <label>Subject <input name="subject" required /></label>
      <label>Description <textarea name="description" required placeholder="e.g. ROMMS complaint logged 5 days ago, no solution yet"></textarea></label>
      <label>External reference no. (optional — e.g. ROMMS complaint no.) <input name="externalReferenceNo" /></label>
      <label>Date originally raised (optional — drives SLA-based criticality) <input name="externalRaisedDate" type="date" /></label>
      <label>SO priority (optional — your own call, separate from the auto-computed criticality below)
        <select name="soPriority">
          <option value="">Not set</option>
          ${SO_PRIORITY_OPTIONS.map((p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`).join("")}
        </select>
      </label>
      <button type="submit" class="btn">Raise request</button>
    </form>`;
}
function wireRequestRaiseForm(onDone) {
    const el = document.querySelector("#dealer-request-form");
    if (!el)
        return;
    const categorySelect = document.querySelector("#dealer-request-category");
    const modernisationField = document.querySelector("#modernisation-type-field");
    const syncModernisationVisibility = () => {
        if (modernisationField)
            modernisationField.style.display = categorySelect?.value === "Modernisation" ? "" : "none";
    };
    categorySelect?.addEventListener("change", syncModernisationVisibility);
    syncModernisationVisibility();
    el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        if (!data.externalReferenceNo)
            delete data.externalReferenceNo;
        if (!data.externalRaisedDate)
            delete data.externalRaisedDate;
        if (!data.soPriority)
            delete data.soPriority;
        if (data.category !== "Modernisation")
            delete data.modernisationType;
        const created = await api.post("/dealer-requests", data);
        toast("Request raised — AI triage note generated");
        onDone(created.id);
    });
}
async function renderDealerDesk() {
    const [requests, outlets] = await Promise.all([api.get("/dealer-requests"), api.get("/outlets")]);
    const outletName = (id) => outlets.find((o) => o.id === id)?.name ?? id;
    app().innerHTML = `
    <section class="panel">
      <h2>Dealer Request Desk</h2>
      <p class="muted">The official channel for a dealer to raise a request against their own outlet — ROMMS complaints, ITPS/tank-gauging outages, SMS delivery failures, market intelligence, or anything else. Criticality is assigned by an explainable rule (category + how long it's been open + urgency language), an AI triage note is drafted immediately, and Critical/High requests are auto-highlighted to the SO via Module 4/5.</p>

      <h3>Raise a new request</h3>
      ${requestRaiseForm(outlets)}

      <h3>All requests</h3>
      <table class="table">
        <thead><tr><th>Criticality</th><th>SO Priority</th><th>Category</th><th>Subject</th><th>Outlet</th><th>Status</th><th>Raised</th><th></th></tr></thead>
        <tbody>${requests
        .map((r) => `<tr>
          <td><span class="badge badge--${r.criticality.toLowerCase()}">${escapeHtml(r.criticality)}</span></td>
          <td>${soPriorityBadge(r.soPriority) || '<span class="muted">Not set</span>'}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.subject)}</td>
          <td><a href="#/outlets/${r.outletId}">${escapeHtml(outletName(r.outletId))}</a></td>
          <td><span class="badge badge--${r.status.toLowerCase()}">${escapeHtml(r.status)}</span></td>
          <td>${r.raisedAt.slice(0, 10)}</td>
          <td><a href="#/dealer-desk/${r.id}">Open &rarr;</a></td>
        </tr>`)
        .join("") || "<tr><td colspan='8'>No requests raised yet.</td></tr>"}</tbody>
      </table>
    </section>`;
    wireRequestRaiseForm((id) => {
        location.hash = `#/dealer-desk/${id}`;
    });
}
async function renderDealerRequestDetail(id) {
    const r = await api.get(`/dealer-requests/${id}`);
    const outlet = await api.get(`/outlets/${r.outletId}`);
    app().innerHTML = `
    <section class="panel">
      <a href="#/dealer-desk">&larr; All requests</a>
      <h2>${escapeHtml(r.subject)}</h2>
      <p>
        <span class="badge badge--${r.criticality.toLowerCase()}">${escapeHtml(r.criticality)}</span>
        <span class="badge badge--${r.status.toLowerCase()}">${escapeHtml(r.status)}</span>
        ${soPriorityBadge(r.soPriority)}
        ${escapeHtml(r.category)} · <a href="#/outlets/${r.outletId}">${escapeHtml(outlet.name)}</a> · Dealer: ${escapeHtml(r.dealerName)}
      </p>
      <p class="muted">Raised: ${r.raisedAt.slice(0, 19).replace("T", " ")}${r.externalReferenceNo ? ` · Ext. ref: ${escapeHtml(r.externalReferenceNo)}` : ""}${r.externalRaisedDate ? ` · Originally raised: ${escapeHtml(r.externalRaisedDate)}` : ""}</p>

      <h3>Why this criticality?</h3>
      <p>${escapeHtml(r.criticalityReason)}</p>

      <h3>SO priority</h3>
      <form id="priority-form" class="form--inline">
        <select name="soPriority">
          <option value="">Not set</option>
          ${SO_PRIORITY_OPTIONS.map((p) => `<option value="${p.value}" ${r.soPriority === p.value ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
        </select>
        <input name="setBy" placeholder="Your name" required />
        <button type="submit" class="btn">Set priority</button>
      </form>

      <h3>Forward to stakeholder(s)</h3>
      ${r.forwarding.length
        ? `<ul class="log">${r.forwarding
            .map((f) => `<li><span class="muted">${f.forwardedAt.slice(0, 19).replace("T", " ")}</span> — <strong>${escapeHtml(f.forwardedBy)}</strong> forwarded to ${f.stakeholders.map((s) => escapeHtml(STAKEHOLDER_OPTIONS.find((o) => o.value === s)?.label ?? s)).join(", ")}${f.note ? `: ${escapeHtml(f.note)}` : ""}</li>`)
            .join("")}</ul>`
        : `<p class="muted">Not forwarded to any stakeholder yet.</p>`}
      <form id="forward-form" class="form">
        <label>Stakeholder(s)
          <span class="form--inline">
            ${STAKEHOLDER_OPTIONS.map((s) => `<label><input type="checkbox" name="stakeholder" value="${s.value}" /> ${escapeHtml(s.label)}</label>`).join("")}
          </span>
        </label>
        <label>Note (optional) <input name="note" /></label>
        <label>Your name <input name="forwardedBy" required /></label>
        <button type="submit" class="btn">Forward</button>
      </form>

      <h3>AI triage note</h3>
      <pre class="ai-output">${escapeHtml(r.aiTriageNote)}</pre>
      ${r.citedPolicyClauses?.length
        ? `<p class="muted">Knowledge Centre clauses cited: ${r.citedPolicyClauses.map(escapeHtml).join("; ")}</p>`
        : `<p class="muted">No Knowledge Centre clause matched this request — add a ${escapeHtml(r.category)}-specific policy clause in Module 6 to have it cited here automatically.</p>`}

      <h3>Thread</h3>
      <ul class="log">${r.thread
        .map((m) => `<li><span class="muted">${m.timestamp.slice(0, 19).replace("T", " ")}</span> — <strong>${escapeHtml(m.from)}${m.authorName ? ` (${escapeHtml(m.authorName)})` : ""}</strong>: ${escapeHtml(m.text)}</li>`)
        .join("")}</ul>

      ${r.status !== "Resolved"
        ? `
      <h3>Dealer follow-up</h3>
      <form id="followup-form" class="form--inline">
        <input name="text" placeholder="Add a follow-up..." style="flex:1" required />
        <button type="submit" class="btn">Send</button>
      </form>

      <h3>SO response</h3>
      <form id="respond-form" class="form">
        <label>Your name <input name="responderName" required /></label>
        <label>Response <textarea name="text" required></textarea></label>
        <label>Update status
          <select name="status">
            <option value="">Keep as-is (auto -&gt; InProgress)</option>
            <option value="InProgress">InProgress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </label>
        <button type="submit" class="btn">Send response</button>
      </form>

      <div class="form--inline">
        <form id="escalate-form" class="form--inline">
          <input name="escalatedBy" placeholder="Your name" required />
          <input name="reason" placeholder="Escalation reason" style="flex:1" required />
          <button type="submit" class="btn btn--danger">Escalate</button>
        </form>
      </div>

      <h3>Resolve</h3>
      <form id="resolve-form" class="form">
        <label>Resolved by <input name="resolvedBy" required /></label>
        <label>Resolution summary <textarea name="resolutionSummary" required></textarea></label>
        <button type="submit" class="btn">Mark resolved</button>
      </form>`
        : `<p class="badge badge--resolved">Resolved${r.resolvedAt ? ` — ${r.resolvedAt.slice(0, 19).replace("T", " ")}` : ""}</p><p>${escapeHtml(r.resolutionSummary ?? "")}</p>`}
    </section>`;
    const on = (sel, handler) => {
        const el = document.querySelector(sel);
        if (el)
            handler(el);
    };
    on("#priority-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        if (!data.soPriority) {
            toast("Pick a priority level first");
            return;
        }
        await api.post(`/dealer-requests/${id}/priority`, data);
        toast("Priority updated");
        await renderDealerRequestDetail(id);
    }));
    on("#forward-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const stakeholders = [...form.querySelectorAll('[name="stakeholder"]:checked')].map((el) => el.value);
        if (!stakeholders.length) {
            toast("Pick at least one stakeholder");
            return;
        }
        const data = formToObject(form);
        await api.post(`/dealer-requests/${id}/forward`, { stakeholders, forwardedBy: data.forwardedBy, note: data.note || undefined });
        toast("Forwarded — task(s) created, visible in Teams Communication / SO Cockpit");
        await renderDealerRequestDetail(id);
    }));
    on("#followup-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/dealer-requests/${id}/followup`, { text: data["text"] });
        toast("Follow-up sent");
        await renderDealerRequestDetail(id);
    }));
    on("#respond-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        if (!data.status)
            delete data.status;
        await api.post(`/dealer-requests/${id}/respond`, data);
        toast("Response sent");
        await renderDealerRequestDetail(id);
    }));
    on("#escalate-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/dealer-requests/${id}/escalate`, data);
        toast("Escalated");
        await renderDealerRequestDetail(id);
    }));
    on("#resolve-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/dealer-requests/${id}/resolve`, data);
        toast("Marked resolved");
        await renderDealerRequestDetail(id);
    }));
}
//# sourceMappingURL=app.js.map