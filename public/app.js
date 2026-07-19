import { api } from "./api.js";
import { escapeHtml, qs, qsa, toast, formToObject } from "./dom.js";
const app = () => qs("#app");
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
}
async function renderOutletDetail(id) {
    const report = await api.get(`/outlets/${id}/report`);
    const o = report.outlet;
    app().innerHTML = `
    <section class="panel">
      <a href="#/outlets">&larr; All outlets</a>
      <h2>${escapeHtml(o.name)}</h2>
      <p>${escapeHtml(o.salesArea)} · ${escapeHtml(o.district)} · ${escapeHtml(o.status)} · Dealer: ${escapeHtml(o.dealerName ?? "-")}</p>
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

      ${renderCanopySection(o.id, o.status, report.canopyRequest)}
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
    wireOutletCanopyHandlers(o.id);
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
      <p class="muted">Stretch identification &rarr; feasibility &rarr; application &rarr; ASC/LEC/FVC &rarr; file note &rarr; LOI &rarr; milestones &rarr; NOC (auto-generates lease + dealership agreement) &rarr; MDM/SAP &rarr; budget &rarr; project &rarr; commissioning &rarr; canopy addition.</p>

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
async function renderCaseDetail(id) {
    const c = await api.get(`/cases/${id}`);
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
    <button id="gen-feasibility" class="btn">Generate feasibility report (AI)</button>
    ${c.feasibilityReport ? `<pre class="ai-output">${escapeHtml(c.feasibilityReport.text)}</pre>` : ""}
  `);
    // Application (field set mirrors HPCL's real "Application for Retail Outlet Dealership" form)
    sections.push(`
    <h3>Application intake</h3>
    ${c.application
        ? `<table class="table"><tbody>${Object.entries(c.application)
            .filter(([k]) => k !== "otherFields")
            .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
            .join("")}</tbody></table>`
        : `<div class="form">
        <label>Upload dealer's Application Form (optional — best-effort field extraction, text-based files only; no OCR service is available offline, so scanned images won't extract)
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
    // File note — real HPCL "Approved File Note" routing-chain format.
    sections.push(`
    <h3>File note <span class="muted">(AI-drafted Initiation stage, cites Knowledge Centre clauses)</span></h3>
    ${c.fileNote
        ? `
      <p>System ID: ${escapeHtml(c.fileNote.systemId)} · Initiated: ${escapeHtml(c.fileNote.initiatedOn)}</p>
      <p><strong>${escapeHtml(c.fileNote.subject)}</strong></p>
      ${c.fileNote.routing
            .map((r) => `
        <div class="routing-stage">
          <p class="muted">${escapeHtml(r.role)} — ${escapeHtml(r.actorName)}, ${escapeHtml(r.actorTitle)} · ${r.timestamp.slice(0, 19).replace("T", " ")}</p>
          <p>${escapeHtml(r.remarks)}</p>
        </div>`)
            .join("")}
      <p>Status: <strong>${escapeHtml(c.fileNote.status)}</strong></p>
      ${c.fileNote.policyClausesCited.length ? `<p class="muted">Clauses cited: ${c.fileNote.policyClausesCited.map(escapeHtml).join("; ")}</p>` : ""}
      `
        : "<p class='muted'>Not generated yet.</p>"}
    <button id="gen-filenote" class="btn">Generate file note (AI)</button>
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
    // Budget
    if (c.customerMaster) {
        sections.push(`
      <h3>Budget approval / IRR / cost estimate</h3>
      ${c.budget
            ? `<pre class="ai-output">${escapeHtml(c.budget.noteText)}</pre><p>Status: <strong>${escapeHtml(c.budget.status)}</strong></p>
          ${c.budget.status === "Submitted"
                ? `<form id="budget-decision" class="form form--inline">
              <button type="submit" name="approve" value="1" class="btn">Approve</button>
              <button type="submit" name="approve" value="0" class="btn btn--danger">Reject</button>
            </form>`
                : ""}`
            : `<form id="budget-form" class="form form--inline">
          <input name="costEstimate" type="number" placeholder="Cost estimate (Rs.)" required />
          <input name="irr" type="number" step="0.1" placeholder="IRR %" required />
          <button type="submit" class="btn">Generate budget note (AI)</button>
        </form>`}
    `);
    }
    // Project execution / Gantt
    if (c.project) {
        sections.push(`
      <h3>Project management &amp; Gantt chart (AI-generated)</h3>
      <table class="table">
        <thead><tr><th>Task</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
        <tbody>${c.project.ganttTasks.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${t.startDate}</td><td>${t.endDate}</td><td>${escapeHtml(t.status)}</td></tr>`).join("")}</tbody>
      </table>
      <p>Estimated commissioning: <strong>${c.project.estimatedCommissionDate}</strong></p>
      ${c.stage === "ProjectExecution" ? `<button id="commission-btn" class="btn">Commission outlet — mark Nozzle Sales Started</button>` : ""}
    `);
    }
    // Commissioned
    if (c.stage === "Commissioned") {
        sections.push(`<h3>Outlet commissioned</h3><p><a href="#/outlets/${c.outletId}">View outlet record &rarr;</a> — canopy addition and further requests are managed from the outlet page.</p>`);
    }
    sections.push(`
    <h3>Activity log</h3>
    <ul class="log">${c.activityLog.map((a) => `<li><span class="muted">${a.timestamp.slice(0, 19).replace("T", " ")}</span> — <strong>${escapeHtml(a.actor)}</strong>: ${escapeHtml(a.action)}${a.details ? ` (${escapeHtml(a.details)})` : ""}</li>`).join("")}</ul>
  `);
    app().innerHTML = `<section class="panel">${sections.join("")}</section>`;
    wireCaseHandlers(c);
}
// Canopy addition — available on any operational outlet's page (not gated on a live Module 2 case).
function renderCanopySection(outletId, outletStatus, req) {
    if (outletStatus !== "Operational") {
        return `<h3>Canopy Addition</h3><p class="muted">Available once the outlet is operational.</p>`;
    }
    if (!req) {
        return `
      <h3>Canopy Addition <span class="muted">(dealer request-cum-commitment proposal)</span></h3>
      <form id="canopy-request-form" class="form">
        <label>Committed volume (KL/month) <input name="committedVolumeKL" type="number" required /></label>
        <label>Cost estimate (Rs.) <input name="costEstimate" type="number" required /></label>
        <label>IRR (%) <input name="irr" type="number" step="0.1" required /></label>
        <label>Dealer justification <textarea name="dealerJustification" required></textarea></label>
        <button type="submit" class="btn">Submit canopy request</button>
      </form>`;
    }
    const parts = [
        `<h3>Canopy Addition request</h3>
     <p>Committed: ${req.committedVolumeKL} KL/month · Cost: Rs. ${req.costEstimate.toLocaleString("en-IN")} · IRR: ${req.irr}%</p>
     <p>Dealer justification: ${escapeHtml(req.dealerJustification)}</p>`,
    ];
    if (!req.soDecision) {
        parts.push(`
      <form id="canopy-decision-form" class="form">
        <label>Decided by <input name="decidedBy" required /></label>
        <label>Justification <textarea name="justification" required></textarea></label>
        <div class="form--inline">
          <button type="submit" name="decision" value="Approved" class="btn">Approve</button>
          <button type="submit" name="decision" value="Rejected" class="btn btn--danger">Reject</button>
        </div>
      </form>`);
    }
    else {
        parts.push(`<p>SO decision: <strong>${escapeHtml(req.soDecision.decision)}</strong> by ${escapeHtml(req.soDecision.decidedBy)} — ${escapeHtml(req.soDecision.justification)}</p>`);
        if (req.fileNote) {
            parts.push(`
        <h4>File note</h4>
        <p class="muted">System ID: ${escapeHtml(req.fileNote.systemId)} · Initiated: ${escapeHtml(req.fileNote.initiatedOn)}</p>
        ${req.fileNote.routing
                .map((r) => `
          <div class="routing-stage">
            <p class="muted">${escapeHtml(r.role)} — ${escapeHtml(r.actorName)}, ${escapeHtml(r.actorTitle)} · ${r.timestamp.slice(0, 19).replace("T", " ")}</p>
            <p>${escapeHtml(r.remarks)}</p>
          </div>`)
                .join("")}
        <p><a class="btn btn--sm" href="/api/outlets/${outletId}/canopy-file-note.pdf" target="_blank">⬇ Download file note PDF</a></p>
      `);
        }
        if (req.budgetNoteText)
            parts.push(`<h4>Budget note</h4><pre class="ai-output">${escapeHtml(req.budgetNoteText)}</pre>`);
        if (req.eamStatus && req.eamStatus !== "Pending") {
            parts.push(`<p>EAM status: <strong>${escapeHtml(req.eamStatus)}</strong></p>`);
        }
        else if (req.eamStatus === "Pending") {
            parts.push(`
        <form id="canopy-eam-form" class="form--inline">
          <button type="submit" name="approve" value="1" class="btn">Approve EAM</button>
          <button type="submit" name="approve" value="0" class="btn btn--danger">Reject EAM</button>
        </form>`);
        }
        if (req.weeklyPerformance?.length) {
            parts.push(`
        <h4>Weekly performance vs commitment</h4>
        <table class="table"><thead><tr><th>Week of</th><th>Committed</th><th>Actual</th><th>On track</th></tr></thead>
        <tbody>${req.weeklyPerformance.map((w) => `<tr><td>${w.weekOf}</td><td>${w.committedKL} KL</td><td>${w.actualKL} KL</td><td>${w.onTrack ? "✅" : "⚠️"}</td></tr>`).join("")}</tbody></table>`);
        }
        if (req.eamStatus === "Approved") {
            parts.push(`
        <form id="canopy-weekly-form" class="form--inline">
          <input name="actualKL" type="number" placeholder="Actual KL this week" required />
          <button type="submit" class="btn">Record weekly check</button>
        </form>`);
        }
    }
    return parts.join("");
}
function wireOutletCanopyHandlers(outletId) {
    const on = (sel, handler) => {
        const el = document.querySelector(sel);
        if (el)
            handler(el);
    };
    on("#canopy-request-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/outlets/${outletId}/canopy-request`, {
            committedVolumeKL: Number(data["committedVolumeKL"]),
            costEstimate: Number(data["costEstimate"]),
            irr: Number(data["irr"]),
            dealerJustification: data["dealerJustification"],
        });
        toast("Canopy request submitted");
        await renderOutletDetail(outletId);
    }));
    on("#canopy-decision-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        const data = formToObject(e.target);
        await api.post(`/outlets/${outletId}/canopy-request/decision`, {
            decision: submitter.value,
            justification: data["justification"],
            decidedBy: data["decidedBy"],
        });
        toast("Canopy decision recorded");
        await renderOutletDetail(outletId);
    }));
    on("#canopy-eam-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        await api.post(`/outlets/${outletId}/canopy-request/eam`, { approve: submitter.value === "1" });
        toast("EAM decision recorded");
        await renderOutletDetail(outletId);
    }));
    on("#canopy-weekly-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/outlets/${outletId}/canopy-request/weekly-check`, { actualKL: Number(data["actualKL"]) });
        toast("Weekly performance recorded");
        await renderOutletDetail(outletId);
    }));
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
function renderAscBlock(c) {
    const existing = c.inspections.asc;
    if (existing) {
        return `<div class="inspection"><h4>ASC — Application Scrutiny Committee</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre></div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>ASC — Application Scrutiny Committee</h4><p class="muted">Save the Application intake above first — ASC auto-populates from it.</p></div>`;
    }
    return `
    <div class="inspection">
      <h4>ASC — Application Scrutiny Committee <span class="muted">(Annexure V)</span></h4>
      <p class="muted">Application No. ${escapeHtml(c.application.applicationNo)} · ${escapeHtml(c.application.applicantName)} · Category ${escapeHtml(c.application.applicantCategory)} — auto-populated from the Application above.</p>
      <form id="asc-form" class="form">
        <table class="table"><thead><tr><th>#</th><th>Particulars</th><th>Applicability</th><th>Answer</th></tr></thead>
        <tbody>${ASC_CHECKLIST.map((it) => `<tr><td>${it.id}</td><td>${escapeHtml(it.particular)}</td><td>${escapeHtml(it.applicability)}</td><td>${yesNoSelect(`item_${it.id}`)}</td></tr>`).join("")}</tbody></table>
        <label>Rectifiable deficiencies (one per line) <textarea name="rectifiable"></textarea></label>
        <label>Non-rectifiable deficiencies (one per line) <textarea name="nonRectifiable"></textarea></label>
        <label>Recommendation of ASC
          <select name="recommendation" required>
            <option value="">Select…</option>
            <option>Eligible</option>
            <option>Ineligible</option>
            <option>Eligible Subject to Rectification of Deficiencies</option>
            <option>To be considered under Group-3</option>
          </select>
        </label>
        <label>Member I <input name="member1" required /></label>
        <label>Member II <input name="member2" required /></label>
        <button type="submit" class="btn">Submit ASC</button>
      </form>
    </div>`;
}
function renderLecBlock(c) {
    const existing = c.inspections.lec;
    if (existing) {
        return `<div class="inspection"><h4>LEC — Land Evaluation Committee</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre></div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>LEC — Land Evaluation Committee</h4><p class="muted">Save the Application intake above first — LEC auto-populates from it.</p></div>`;
    }
    const a = c.application;
    return `
    <div class="inspection">
      <h4>LEC — Land Evaluation Committee <span class="muted">(Annexure W1)</span></h4>
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
        return `<div class="inspection"><h4>FVC — Field Verification of Credentials</h4><pre class="ai-output">${escapeHtml(existing.reportText)}</pre></div>`;
    }
    if (!c.application) {
        return `<div class="inspection"><h4>FVC — Field Verification of Credentials</h4><p class="muted">Save the Application intake above first — FVC auto-populates from it.</p></div>`;
    }
    return `
    <div class="inspection">
      <h4>FVC — Field Verification of Credentials <span class="muted">(Annexure Y)</span></h4>
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
    on("#gen-feasibility", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/feasibility`);
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
    on("#application-upload", (el) => el.addEventListener("change", async (e) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file)
            return;
        const text = await file.text();
        const result = await api.post(`/cases/${c.id}/application/extract`, { text, fileName: file.name });
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
    on("#gen-filenote", (el) => el.addEventListener("click", async () => {
        await api.post(`/cases/${c.id}/file-note`);
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
    on("#budget-form", (el) => el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        await api.post(`/cases/${c.id}/budget`, { costEstimate: Number(data["costEstimate"]), irr: Number(data["irr"]) });
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
async function renderAnalytics() {
    const summary = await api.get("/analytics/summary");
    app().innerHTML = `
    <section class="panel">
      <h2>Predictive Analysis</h2>
      <p class="muted">Sales feed shown as fetched from CRIS. Analytical dashboard for the Sales Officer — ask anything.</p>

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
}
// ---------------------------------------------------------------------------
// Module 4 — Teams Communication
// ---------------------------------------------------------------------------
async function renderTeams() {
    const [team, tasks, notes, openWork, outlets, cases] = await Promise.all([
        api.get("/team"),
        api.get("/tasks"),
        api.get("/memory-notes"),
        api.get("/teams/open-workflows"),
        api.get("/outlets"),
        api.get("/cases"),
    ]);
    const memberName = (id) => team.find((t) => t.id === id)?.name ?? id;
    app().innerHTML = `
    <section class="panel">
      <h2>Teams Communication</h2>
      <p class="muted">Sales-area summary, KPI tracker, task assignment, open workflows &amp; proposals.</p>

      <h3>Open cases in progress</h3>
      <ul>
        ${openWork.openCases.map((c) => `<li><a href="#/cases/${c.id}">${escapeHtml(c.stretchName)}</a> — <span class="badge">${escapeHtml(c.stage)}</span></li>`).join("") || "<li>No open cases.</li>"}
      </ul>

      <h3>Open workflows &amp; proposals awaiting approval</h3>
      <ul>
        ${openWork.proposalsAwaitingApproval.map((p) => `<li><a href="#/cases/${p.caseId}">${escapeHtml(p.stretchName)}</a> — ${escapeHtml(p.awaiting)}</li>`).join("")}
        ${openWork.canopyProposalsAwaitingApproval.map((p) => `<li><a href="#/outlets/${p.outletId}">${escapeHtml(p.outletName)}</a> — ${escapeHtml(p.awaiting)}</li>`).join("")}
        ${!openWork.proposalsAwaitingApproval.length && !openWork.canopyProposalsAwaitingApproval.length ? "<li>Nothing awaiting approval.</li>" : ""}
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
    </section>`;
}
// ---------------------------------------------------------------------------
// Module 6 — Knowledge Centre
// ---------------------------------------------------------------------------
async function renderKnowledge() {
    const clauses = await api.get("/policy-clauses");
    app().innerHTML = `
    <section class="panel">
      <h2>Knowledge Centre — Policy Bot</h2>
      <p class="muted">Ask a question; the bot cites the relevant clause. Also auto-invoked when Module 2 drafts file notes.</p>

      <form id="ask-policy-form" class="form--inline">
        <input name="question" placeholder="e.g. What is the minimum land area for a highway outlet?" style="flex:1" required />
        <button type="submit" class="btn">Ask</button>
      </form>
      <div id="policy-answer"></div>

      <h3>Loaded policy clauses</h3>
      <table class="table">
        <thead><tr><th>Document</th><th>Clause</th><th>Heading</th><th>Text</th></tr></thead>
        <tbody>${clauses.map((c) => `<tr><td>${escapeHtml(c.documentTitle)}</td><td>${escapeHtml(c.clauseNumber)}</td><td>${escapeHtml(c.heading)}</td><td>${escapeHtml(c.text)}</td></tr>`).join("")}</tbody>
      </table>

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
    { value: "Other", label: "Other" },
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
        <select name="category">${DEALER_REQUEST_CATEGORIES.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join("")}</select>
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
    el.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = formToObject(e.target);
        if (!data.externalReferenceNo)
            delete data.externalReferenceNo;
        if (!data.externalRaisedDate)
            delete data.externalRaisedDate;
        if (!data.soPriority)
            delete data.soPriority;
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