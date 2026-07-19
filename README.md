# Retail Network Ops — TypeScript Prototype

A working prototype covering the six modules from the brief — outlet data
repository, AI-assisted dealer selection & development workflow, predictive
analytics, team communication, an SO cockpit, and a policy knowledge centre —
plus a seventh module added on request: a dealer-facing Request Desk (ROMMS/
ITPS/SMS/Market Intelligence). Goal per the brief: save Sales Officer /
Retail team time by automating the dealer-to-commissioning lifecycle with
generative AI "or otherwise."

**This is a live generator, not a set of worked examples.** Real HPCL
Gurgaon Region / Faridabad Sales Area documents were supplied for this
prototype and are used throughout to ground the type model and the AI
engine's templates in real formats — but Module 2 starts with **zero
cases**. A Sales Officer opens a case (new-site development, resitement, or
a canopy addition on any outlet) through the UI, and every document
(feasibility report, file note, LOI, budget note, lease deed, Dealership
Agreement) is generated fresh from what they enter, in the real format. See
"What's real vs. generated on demand" below.

## Why it's built this way

This was built inside a network-restricted sandbox that could not reach the
npm/pip registries, so it deliberately has **zero external runtime
dependencies** — only Node.js built-ins (`node:http`, `node:fs`, `node:zlib`)
and the TypeScript compiler. That's a constraint of *this build environment*,
not a recommendation: on a normal machine, run `npm install` (typecheck/dev
dependencies only — `typescript`, `@types/node`) and swap in a real
framework/DB/PDF library wherever it helps.

## Running it

```bash
npm install        # only devDependencies: typescript, @types/node
npm run build       # compiles src/ -> dist/ and src-client/ -> public/
npm start           # serves http://localhost:4300
```

`public/index.html` is the single-page app; it talks to the JSON API under
`/api/*`. No bundler, no framework — vanilla TS compiled to ES modules.

## Module map

1. **Outlet Data Repository** (`src/routes/outlets.ts`, `src/services/pdfGen.ts`)
   Master sheet (real column set from the Faridabad SA dealer-agreement
   master workbook) + a fixed-asset summary (real SAP FAIL export format;
   the one-pager shows totals only — Total Invested / Total Depreciation /
   Net Book Value — with a separate itemised Fixed Assets tab per outlet) +
   communications log, a one-pager report (a real, hand-generated PDF — see
   "Zero-dependency PDF" below), and a link to its Module 2 case if one is
   open. Every outlet also gets a **Canopy Addition** section (see below).

2. **Dealer Selection & Development** (`src/services/dealerWorkflow.ts`,
   `src/routes/dealerCases.ts`) — the core workflow engine. Starts with an
   empty case list. Open a case (for any real stretch/outlet you name) and
   it moves through 12 stages: stretch identification (real KML/KMZ
   parsing, `src/services/kml.ts`) → roster → AI feasibility report →
   application intake (real Dealer Selection Guidelines 2023 Appendix-IA/IB
   field set) → **ASC / LEC / FVC inspections in the real DSG Annexure V / W1
   / Y layouts** (`src/services/dsgForms.ts`) → AI file note, modelled on
   HPCL's real "Approved File Note" SAP routing chain (Initiation →
   Recommendation → Approval, cites Knowledge Centre clauses) → AI
   Intimation Letter (LOI) → 2-way milestone tracking (map, drawing/DM
   letter, PESO application/receipt, department forwarding, NOC) → **on NOC
   receipt, a Lease Agreement and Dealership Agreement auto-generate** →
   MDM/SAP customer-master sync → AI RBC budget/IRR note (cites the real
   EAM Chapter V Clause 5.2.a and Chapter I Clause 6.2.b) → AI-scheduled Gantt
   project plan → commissioning (creates the live Outlet record, marks
   "Nozzle Sales Started").

   **ASC / LEC / FVC** (`src/services/dsgForms.ts`, `wf.submitAsc` /
   `submitLec` / `submitFvc` in `dealerWorkflow.ts`) reproduce the real DSG
   Annexure V (Application Scrutiny Committee — 19-item eligibility
   checklist), Annexure W1 (Land Evaluation Committee — frontage/depth/area/
   ROW/HT-line/NHAI criteria) and Annexure Y (Field Verification of
   Credentials — 9-item document verification table) layouts. Every field
   that also appears on the Application Form (application no., applicant
   name, category, land dimensions, etc.) is auto-populated from it — the
   committee only fills in its own Yes/No findings, deficiencies and
   recommendation, exactly as in the real process. The final report is
   formatted to mirror the source Annexure, not a generic summary. New
   Application Forms can be entered for any stretch/candidate — nothing is
   hard-coded to the two sample applications originally supplied.

   A second case type, **Resitement** (relocating an already-commissioned
   outlet — expired lease, road realignment, etc.), reuses the same
   pipeline but adds the real distress trail: grounds (per the real
   Resitement Policy), the dealer's request letter, a legal opinion, and a
   3-member Technical Evaluation Committee report. It can be opened against
   *any* existing outlet from the "existing outlet to resite" dropdown.

   **Canopy addition lives on the Outlet, not the case** (`src/routes/outlets.ts`,
   `wf.requestCanopy` et al. in `dealerWorkflow.ts`): any operational outlet
   — whether or not it was ever the subject of a Module 2 case in this
   session — can get a dealer request-cum-commitment proposal, an SO
   decision (which auto-generates both a routing-chain **file note** and an
   EAM-style **budget note**), EAM approval, and weekly committed-vs-actual
   volume tracking.

3. **Predictive Analysis** (`src/services/predictive.ts`,
   `src/routes/analytics.ts`) — a 60-day sales feed (always surfaced as
   "fetched from CRIS", per the brief), seeded from real outlet volume
   benchmarks, drives: outlets below TA average, dry outlets today, outlets
   with frequent low-stock days, and outlets skewed toward MS over HSD.
   Includes a rule-based "ask anything" query box with example questions
   pre-wired as buttons.

   **"Dry today" and "low on tank stock" are backed by a real live feed**
   where one exists: `src/data/seed.ts` carries the actual 18-07-2026
   per-product (MS/HSD/POWER 95) tank capacity/stock/pumpable-stock/ullage
   snapshot from HPCL's SAP "Stock Ullage Report" for Sunder Service
   Station, HP Kalka Sales and HP Manu Fuels — e.g. HP Manu Fuels' POWER 95
   tank is genuinely at 0 pumpable stock today, and all three of its
   products sit under 11% of capacity. `isDryToday()` prefers this real
   stock feed over the sales-based proxy wherever a snapshot exists (only
   falling back to "no sales recorded" for outlets with no live feed), and
   the outlet one-pager (Module 1) shows the same per-product tank table.
   Sunder Service Station's day-wise sales for 01-18 Jul 2026 are likewise
   the real figures from HPCL's SAP "Nozzle Sales vs SAP Receipt" report
   (that feed doesn't split MS/HSD per day, so the split is estimated from
   the outlet's real product mix — the daily *total*, including its two
   genuine dry days, is real) — see the `sunderRealDailyOverrides` /
   `seedStockSnapshots` blocks in `src/data/seed.ts`.

4. **Teams Communication** (`src/routes/teams.ts`) — task
   assignment/tracking (with an outlet/case-linking dropdown), a live "open
   workflows & proposals awaiting approval" feed pulled from live Module 2
   case state plus any outlet's pending canopy decision, stuck-milestone
   alerts, and shared memory notes.

5. **SO Cockpit** (`src/services/cockpit.ts`) — aggregates tasks from
   Modules 1-4 into the four quadrants from *The 7 Habits of Highly
   Effective People* (urgent/important) — task titles link back to their
   outlet/case — and derives a circuit/town-wise pending-inspection &
   NOC-followup calendar directly from live case state.

6. **Knowledge Centre** (`src/services/policyBot.ts`,
   `src/routes/knowledge.ts`) — a policy-clause store (real Resitement
   Policy, Corpus Fund/CFS Policy, EAM Chapter I/II/V clauses, and the real
   Dealer Selection Guidelines 2023 ASC/LEC/FVC/Group-classification/
   application-fee clauses) with keyword-overlap retrieval. Answers direct
   questions and is auto-invoked by Module 2 (and the canopy file note) when
   drafting documents, so generated notes cite the matched clauses.

7. **Dealer Request Desk** (`src/services/dealerDesk.ts`,
   `src/routes/dealerDesk.ts`) — the official two-way channel between a
   dealer and their Sales Officer, added on request. A dealer raises a
   request against their own outlet in one of the real recurring categories
   — **ROMMS** complaint (e.g. "logged 5 days ago, no solution yet"),
   **ITPS**/tank-gauging outage, **SMS**/price-alert delivery failure, or
   **Market Intelligence** (competitor pricing/activity — informational, not
   a fault). The system assigns criticality (Critical/High/Medium/Low)
   through an **explainable rule**, not a black-box score — category base
   severity, days-open against the dealer's stated original raise date (SLA
   breach at 7 days, escalation at 3), and urgency language in the dealer's
   own description — and every request shows exactly which rule fired. An AI
   triage note (category-specific first-line playbook) is drafted the
   instant the request is raised. Critical/High requests auto-create a
   linked task that surfaces in the **Teams Communication** open-workflows
   feed and lands in the **SO Cockpit**'s Do-First quadrant — so the SO sees
   it ranked by actual severity, not buried in a chronological list. The
   dealer can follow up, the SO can respond/escalate/resolve, and the full
   thread (Dealer/SO/AI/System messages) is kept on the request. The outlet
   one-pager (Module 1) links back to any requests raised for that outlet.
   Starts with zero requests, same live-generator principle as Module 2 —
   nothing is pre-populated.

## What's real vs. generated on demand

**Real, factual reference data** (kept because it's actual master data, not
a fabricated workflow outcome):

- Four real outlets — **HP Manu Fuels**, **Sunder Service Station**, **HP
  Kalka Sales**, **Gayatri Filling Station** — with master-sheet fields
  drawn from the real dealer-agreement master workbook (Customer No., SAP
  Code, District, Class of Market, Year of Commissioning, etc.), real fixed
  assets (Sunder Service Station carries an actual SAP FAIL row; Gayatri
  carries its real leasehold asset), and sales benchmarks grounded in real
  volume figures. Gayatri's real story — land lease lapsed 31.05.2024, sales
  collapsed since — is live data a Sales Officer would see in Module 3 and
  could act on by opening a real Resitement case, rather than a pre-built
  one.
- **Live CRIS-equivalent feed** (`seedStockSnapshots`, `sunderRealDailyOverrides`
  in `src/data/seed.ts`): the real 18-07-2026 per-product tank stock/ullage
  snapshot (SAP "Stock Ullage Report") for Sunder Service Station, HP Kalka
  Sales and HP Manu Fuels, and Sunder's real day-wise nozzle sales for
  01-18 Jul 2026 (SAP "Nozzle Sales vs SAP Receipt" report) — this is what
  now drives the "dry today" and "low on tank stock" signals in Module 3
  wherever a live feed exists for the outlet.
- **Policy clauses**: the real Resitement Policy (HQO, 09-Apr-2025, grounds
  (a)-(f) + viability thresholds), the real CFS/Corpus Fund SC-ST financing
  scheme (HQO, 28-Apr-2018), the real EAM Chapter V Clause 5.2.a (RBC
  approval authority up to Rs. 75 Lacs) and Chapter I Clause 6.2.b (Retail
  engineering engagement approval chain: RBC → Zonal Bids Committee → Bids
  Committee-HQO → Contracts Committee → Executive Committee → CFD), EAM
  Chapter II Clauses 3/7.1/11.1/11.2 (dealer appointment, resignation/
  termination, resitement approval authorities), and the real Dealer
  Selection Guidelines 2023 clauses for the ASC/LEC/FVC process, the
  Group 1/2/3 land-offer classification and the application-fee schedule —
  these are meant to be cited as-is.
- **ASC / LEC / FVC formats**: the real Dealer Selection Guidelines 2023
  Annexure V (Application Scrutiny Committee — 19-item checklist), Annexure
  W1 (Land Evaluation Committee — site suitability parameters) and Annexure
  Y (Field Verification of Credentials — 9-item document table), reproduced
  field-for-field in `src/services/dsgForms.ts` — these are the actual forms
  a real ASC/LEC/FVC would fill in, not a paraphrase.
- **KML stretch identification** (`src/services/kml.ts`) — genuine KML/KMZ
  parsing (including a minimal pure-JS ZIP reader for `.kmz`), run by
  default against a real sample stretch built from the CNG-addition
  proposed-site coordinates in the Faridabad SA backup workbook. (The KMZ
  actually supplied wraps a live Google My Maps link not reachable from
  this sandbox — paste real `<Placemark>` KML text into the UI for any
  other stretch.)

**Reference formats, not replayed data**: the Kalka Sales/Nacholi feasibility
report, LEC, IRR model, cost estimate, RBC budget note, registered lease
deed and Dealership Agreement; the Gayatri resitement legal opinion and
3-member Technical Evaluation Committee report; the Roopendra "Approved File
Note" routing chain; the real Application Form / Intimation Letter formats;
the SAP FAIL export layout — all of these shaped `types.ts` (the field sets)
and `src/services/aiEngine.ts` (the generated-document wording/structure),
but none of them are pre-loaded as finished Module 2 cases. Open a case
yourself to see the system produce the same kind of document for your own
input.

## The "Gen AI or otherwise" layer

`src/services/aiEngine.ts` is the one place every generated document
(feasibility report, file note, canopy file note, Intimation Letter, RBC
budget note, canopy budget note, lease agreement, dealership agreement,
technical evaluation report, policy answer, analytics answer) goes through:

- **`TemplateAiEngine`** (default) — deterministic, offline, dependency-free,
  styled after the real document formats above. This is what runs out of the
  box so the prototype is fully functional with no API key and no network.
- **`AnthropicAiEngine`** — activates automatically the moment an
  `ANTHROPIC_API_KEY` env var is present. Calls the real Claude API directly
  via `fetch` (no SDK needed), and falls back to the template engine if the
  call fails, so a live-AI outage never breaks a workflow.

Swapping providers, or wiring in a different LLM entirely, is a one-file
change.

## Zero-dependency PDF

"Communications: as PDF for record on click," the outlet one-pager, the
Intimation Letter, the Lease Agreement, the Dealership Agreement and the
canopy file note are all real PDFs, not renamed text files —
`src/services/pdfGen.ts` hand-writes a valid PDF 1.4 file (Helvetica text,
correct xref table) with no library.

## What's still a placeholder

- The legacy `DEALERWISE_MASTER...xls` (pre-2007 binary Excel) couldn't be
  parsed without a library unavailable in the build sandbox. A `.xlsx`
  re-export of the same workbook (with a "DEALER AGREEMENT DETAILS" tab)
  *was* supplied and is what the current master-sheet field set is drawn
  from — the remaining tabs (HUDA-MCF-HSIDC sites, terminated ROs, CNG
  outlets) aren't loaded yet.
- Outlet lat/lng for the seeded outlets are approximate (illustrative map
  pins), not surveyed coordinates.
- Full text of the real 42-clause Dealership Agreement and the complete
  15-section Application Form are summarized/keyed by their key fields
  rather than reproduced verbatim — extend `aiEngine.ts` / `types.ts` if the
  full legal text needs to appear in generated documents.

None of this requires re-architecting anything above — every module reads
from `src/store.ts`, so pointing it at more real data is additive.
