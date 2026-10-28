#!/usr/bin/env python3
"""Builds the Modernisation Request end-to-end workflow PDF for Retail Setu.
Every step, route, constant and rate below is taken directly from the real
source (src/services/modernisation.ts, src/routes/outlets.ts, src-client/app.ts) —
nothing here is invented."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT = "/home/user/Retail-Setu/Modernisation_Request_Workflow.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1Custom", fontName="Helvetica-Bold", fontSize=20, spaceAfter=4, textColor=colors.HexColor("#1a3a5c")))
styles.add(ParagraphStyle(name="SubTitle", fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#555555"), spaceAfter=14))
styles.add(ParagraphStyle(name="H2Custom", fontName="Helvetica-Bold", fontSize=14, spaceBefore=16, spaceAfter=6, textColor=colors.HexColor("#1a3a5c")))
styles.add(ParagraphStyle(name="H3Custom", fontName="Helvetica-Bold", fontSize=11.5, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#2c5a8c")))
styles.add(ParagraphStyle(name="BodyCustom", fontName="Helvetica", fontSize=9.7, leading=13.5, spaceAfter=6))
styles.add(ParagraphStyle(name="Small", fontName="Helvetica", fontSize=8.3, leading=11, textColor=colors.HexColor("#555555")))
styles.add(ParagraphStyle(name="StepActor", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white))
styles.add(ParagraphStyle(name="CellBody", fontName="Helvetica", fontSize=8.6, leading=11))
styles.add(ParagraphStyle(name="CellBodyBold", fontName="Helvetica-Bold", fontSize=8.6, leading=11))
styles.add(ParagraphStyle(name="MonoSmall", fontName="Courier", fontSize=8, leading=10.5))

STEP_FILL = colors.HexColor("#1a3a5c")
ALT_FILL = colors.HexColor("#f2f6fa")
GATE_FILL = colors.HexColor("#fdecea")
GATE_TEXT = colors.HexColor("#8a1f11")

story = []

def h1(text):
    story.append(Paragraph(text, styles["H1Custom"]))

def h2(text):
    story.append(Paragraph(text, styles["H2Custom"]))

def h3(text):
    story.append(Paragraph(text, styles["H3Custom"]))

def body(text):
    story.append(Paragraph(text, styles["BodyCustom"]))

def small(text):
    story.append(Paragraph(text, styles["Small"]))

def rule():
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#cccccc"), spaceBefore=4, spaceAfter=10))

# ---------------------------------------------------------------------------
# Title
# ---------------------------------------------------------------------------
h1("Modernisation Request Workflow — End to End")
story.append(Paragraph(
    "Retail Setu &mdash; Canopy / Driveway / DU / Tank / Electric Panel &mdash; "
    "as implemented (Module 7 initiation &rarr; Module 1 review &amp; approval &rarr; EAM gate &rarr; weekly tracking)",
    styles["SubTitle"],
))
rule()

body(
    "A dealer-initiated capital request for one of five real infrastructure categories at an "
    "<b>operational</b> outlet. It is raised in Module 7 (Dealer Request Desk) but reviewed, costed and "
    "decided in Module 1 (the outlet's own page) &mdash; the Sales Officer verifies the cost estimate and "
    "IRR before approving, a separate EAM step gives final sign-off, and approved requests are tracked "
    "weekly for whether the incremental volume they were justified on actually materialises."
)
body(
    "Every rate, depreciation rule and hurdle rate used below is sourced from the real HPCL documents "
    "supplied for this project (the &ldquo;Cost Estimates &mdash; NRO&rdquo; workbook, the &ldquo;Format IRR "
    "Investment Proposal&rdquo; workbook, the HQO circular on evaluating investment proposals, and the "
    "Haryana &ldquo;Eligible GST&rdquo; workbook) &mdash; nothing in the cost/IRR engine is invented."
)

# ---------------------------------------------------------------------------
# Step-by-step flow
# ---------------------------------------------------------------------------
h2("1. The flow, step by step")

def step_table(num, title, actor, screen, action, effect, route=None, gate=None):
    rows = []
    header = Table(
        [[Paragraph(f"STEP {num}", styles["StepActor"]), Paragraph(title, ParagraphStyle(name="StepTitle", fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.white))]],
        colWidths=[22*mm, 150*mm],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), STEP_FILL),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (0,0), 8), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(header)

    body_rows = [
        [Paragraph("Actor", styles["CellBodyBold"]), Paragraph(actor, styles["CellBody"])],
        [Paragraph("Screen", styles["CellBodyBold"]), Paragraph(screen, styles["CellBody"])],
        [Paragraph("Action", styles["CellBodyBold"]), Paragraph(action, styles["CellBody"])],
        [Paragraph("System effect", styles["CellBodyBold"]), Paragraph(effect, styles["CellBody"])],
    ]
    if route:
        body_rows.append([Paragraph("API route", styles["CellBodyBold"]), Paragraph(route, styles["MonoSmall"])])
    bt = Table(body_rows, colWidths=[22*mm, 150*mm])
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), ALT_FILL),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#1a3a5c")),
        ("INNERGRID", (0,0), (-1,-1), 0.3, colors.HexColor("#cfd9e3")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(bt)
    if gate:
        gt = Table([[Paragraph(f"GATE: {gate}", ParagraphStyle(name="Gate", fontName="Helvetica-Bold", fontSize=8.6, textColor=GATE_TEXT))]], colWidths=[172*mm])
        gt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), GATE_FILL),
            ("BOX", (0,0), (-1,-1), 0.5, GATE_TEXT),
            ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(gt)
    story.append(Spacer(1, 10))

step_table(
    1, "Dealer raises the request",
    "Dealer (via SO)", "Module 7 &mdash; Dealer Request Desk &rarr; New Request",
    "Category &ldquo;Modernisation request (Canopy/Driveway/DU/Tank/Electric Panel)&rdquo;, pick the "
    "modernisation type from the dropdown that then appears, enter description/justification.",
    "Creates the Dealer Request, <b>and</b> creates a linked <b>Modernisation Request</b> on the outlet "
    "with a default cost estimate auto-filled from the real rate card for that type.",
    "POST /api/dealer-requests &nbsp;&rarr;&nbsp; internally calls createModernisationRequest()",
    gate="Only allowed for an <b>Operational</b> outlet (createModernisationRequest throws otherwise).",
)

step_table(
    2, "SO opens the request for review",
    "Sales Officer", "Module 1 &mdash; Outlet one-pager &rarr; &ldquo;Modernisation Requests&rdquo; section",
    "Open the outlet page; the new request appears under its type heading (Canopy / Driveway / DU / "
    "Tank / Electric Panel) with &ldquo;requested &lt;date&gt;&rdquo;.",
    "Read-only at this point &mdash; nothing to approve yet until cost estimate + IRR are set.",
    "GET /api/outlets/:id/report",
)

step_table(
    3, "SO verifies / edits the cost estimate",
    "Sales Officer", "Same section, cost-estimate line-item table",
    "Adjust quantity/rate on any pre-filled line item (each tagged Civil or Plant &amp; Machinery &mdash; "
    "see &sect;3 for the real rate card).",
    "Recomputes Civil amount, Plant &amp; Machinery amount, subtotal, the non-creditable-GST add-back, "
    "and Total Investment. If an IRR was already computed, it is silently recomputed too.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/cost-estimate",
)

step_table(
    4, "SO sets the IRR assumptions and computes IRR",
    "Sales Officer", "Same section, IRR form",
    "Enter the incremental volume the dealer is committing to (KL/month) and the appraisal horizon "
    "(years, default 10). Margin, depreciation and tax rates are pre-filled real constants &mdash; see &sect;3.",
    "Runs the real WDV-depreciation + tax + salvage cash-flow model and bisection-solves for IRR, "
    "flagging whether it clears the 15% minimum hurdle.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/irr",
)

step_table(
    5, "SO records a justification",
    "Sales Officer", "Same section, justification field",
    "Free-text recommendation for why this spend should/shouldn't proceed.",
    "Stored as soJustification &mdash; required before a decision can be recorded.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/justification",
)

step_table(
    6, "SO decides: Approve or Reject",
    "Sales Officer", "Same section, decision buttons",
    "Choose Approved or Rejected, with a justification.",
    "<b>If Approved:</b> auto-generates (a) a real HPCL-format File Note (Background &rarr; Action Taken "
    "&rarr; Proposal &rarr; Approval Sought For, citing the matching Knowledge Centre policy clauses) and "
    "(b) an EAM-delegation-style Budget Approval Note; sets eamStatus to Pending.<br/>"
    "<b>If Rejected:</b> the workflow ends here &mdash; no file note or budget note is generated.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/decision &nbsp;{decision, justification, decidedBy}",
    gate="Blocked with an error unless soJustification is set <b>and</b> IRR has been computed (steps 4 &amp; 5).",
)

step_table(
    7, "EAM gives (or withholds) final sign-off",
    "EAM reviewer", "Same section, EAM approval control (shown once Approved)",
    "Approve or reject at the Engineering Asset Management gate &mdash; a separate decision from the SO's.",
    "Sets eamStatus. If approved <b>and</b> the type is Canopy, flips the outlet's own canopy asset flag "
    "to true.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/eam &nbsp;{approve}",
)

step_table(
    8, "File note is downloaded as a PDF for the record",
    "Sales Officer / auditor", "Same section, &ldquo;Download file note PDF&rdquo; link",
    "Click through once the request has been Approved (the link only appears after step 6).",
    "Renders the stored File Note text as a real PDF and serves it as a download.",
    "GET /api/outlets/:id/modernisation-requests/:reqId/file-note.pdf",
)

step_table(
    9, "Weekly performance check (ongoing, post-approval)",
    "Sales Officer", "Same section, weekly check form",
    "Enter the actual incremental KL/month achieved this week.",
    "Compares actual vs. the committed KL/month from the IRR assumption; flags &ldquo;on track&rdquo; if "
    "actual &ge; 90% of committed. Appended to a running weeklyPerformance log on the request.",
    "POST /api/outlets/:id/modernisation-requests/:reqId/weekly-check &nbsp;{actualKL}",
)

small(
    "Visible throughout: any request still awaiting a decision (or awaiting EAM sign-off) is surfaced in the "
    "<b>SO Cockpit</b>'s open-work list, linking straight back to the outlet page."
)

story.append(PageBreak())

# ---------------------------------------------------------------------------
# Section 2: states diagram (as a simple left-to-right flow table)
# ---------------------------------------------------------------------------
h2("2. Request lifecycle at a glance")

flow_cells = ["Raised\n(Module 7)", "Costed &\nIRR set", "SO\nDecision", "Approved →\nFile Note +\nBudget Note", "EAM\nSign-off", "Weekly\ntracking"]
reject_row = ["", "", "Rejected →\nends here", "", "", ""]
flow_table = Table([flow_cells], colWidths=[28*mm]*6)
flow_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#1a3a5c")),
    ("TEXTCOLOR", (0,0), (-1,-1), colors.white),
    ("FONTNAME", (0,0), (-1,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8),
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("INNERGRID", (0,0), (-1,-1), 1, colors.white),
]))
story.append(flow_table)
story.append(Spacer(1, 4))
small("Rejection at the SO Decision step is a dead end by design &mdash; no file note, no budget note, no EAM step.")
story.append(Spacer(1, 12))

# ---------------------------------------------------------------------------
# Section 3: real cost & IRR engine
# ---------------------------------------------------------------------------
h2("3. The cost estimate &amp; IRR engine (real constants, not invented)")

h3("3.1 Fixed constants used by every request")
const_rows_raw = [
    ["Constant", "Value", "Real source"],
    ["Gross margin", "Rs 975 / KL", "HQO circular “Evaluation of Investment Proposals of New Retail Outlets”, 24-May-2024"],
    ["Operating cost", "Rs 246 / KL", "Same circular"],
    ["Minimum IRR hurdle", "15%", "Same circular — applies irrespective of investment size"],
    ["Civil & Roads depreciation", "10% WDV", "“Format IRR Investment Proposal” workbook, OUTPUT tab"],
    ["Plant & Machinery depreciation", "15% WDV", "Same workbook"],
    ["Salvage value (final year)", "10% of P&M original cost", "Same workbook"],
    ["Corporate tax rate", "25.168% (incl. surcharge & cess)", "Same workbook"],
    ["Default GST rate on capex", "18%", "Typical GST rate on construction/plant items"],
    ["GST non-creditable fraction", "89.33% (Haryana)", "“Eligible GST 2023-24” workbook — share of HPCL’s Haryana turnover that is non-GST fuel"],
    ["Default appraisal horizon", "10 years", "Project default; editable per request"],
]
const_rows = [const_rows_raw[0]] + [
    [Paragraph(c, styles["CellBody"]) for c in row] for row in const_rows_raw[1:]
]
t = Table(const_rows, colWidths=[42*mm, 34*mm, 96*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1a3a5c")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, ALT_FILL]),
    ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#cfd9e3")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
]))
story.append(t)
story.append(Spacer(1, 10))

h3("3.2 How IRR is actually computed")
body(
    "Year 0 is the full capex outflow (Total Investment). For each year 1..horizon: Civil and Plant & "
    "Machinery written-down values each depreciate at their fixed WDV rate (half-rate in year 1, under "
    "the &ldquo;investment made mid-year&rdquo; convention); net income is the committed incremental "
    "volume &times; 12 &times; (gross margin &minus; operating cost), halved in year 1; profit before tax "
    "is net income minus depreciation; tax applies only when profit before tax is positive; the year's "
    "cash flow is profit-after-tax + depreciation added back, plus a one-time salvage inflow (10% of the "
    "original Plant & Machinery cost) in the final year. IRR is then bisection-solved as the discount rate "
    "that nets these cash flows to zero."
)

h3("3.3 Cost add-back for non-creditable GST")
body(
    "Total Investment is not just the line-item subtotal: GST paid on capex that HPCL cannot claim as "
    "input credit is added back to the investment base &mdash; "
    "<font face=\"Courier\">subtotal &times; 18% &times; 89.33%</font> &mdash; using the real Haryana "
    "non-creditable ratio from the Eligible GST workbook."
)

story.append(PageBreak())

# ---------------------------------------------------------------------------
# Section 4: real rate card by type
# ---------------------------------------------------------------------------
h2("4. Real rate card, by modernisation type")
body(
    "Every new request is pre-filled with these exact line items (quantity is the workbook's own default "
    "and is editable by the SO in step 3). Bucket assignment follows the source workbook's own guideline "
    "notes."
)

RATE_CARDS = {
    "Canopy": [
        ("Canopy Foundation", "Civil", "EA", "46,000", "6"),
        ("Prefab Canopy with LED", "Civil", "SQM", "6,500", "300"),
        ("RVI (signage / facia branding)", "Plant & Machinery", "SQM", "2,600", "300"),
        ("Yard lights with LED", "Plant & Machinery", "Nos", "25,000", "6"),
    ],
    "Driveway": [
        ("WBM Layer 1", "Civil", "SQM", "200", "350"),
        ("WBM Layer 2", "Civil", "SQM", "190", "350"),
        ("WBM Layer 3", "Civil", "SQM", "190", "350"),
        ("GSB - 150mm", "Civil", "SQM", "320", "350"),
        ("Paver", "Civil", "SQM", "1,000", "350"),
        ("RCC with steel cost - 6\"", "Civil", "SQM", "7,400", "100"),
        ("Kerb wall", "Civil", "RMT", "550", "150"),
    ],
    "DU (Dispensing Unit)": [
        ("DU installation (civil)", "Civil", "Nos", "10,000", "1"),
        ("Pipe lines 50NB HDPE", "Civil", "RMT", "2,500", "50"),
        ("DU (SDD/HDD unit)", "Plant & Machinery", "EA", "135,000", "1"),
    ],
    "Tank": [
        ("Tank installation, 16 KL, RCC pit (civil)", "Civil", "Nos", "400,000", "1"),
        ("Tank installation, 22 KL, RCC pit (civil)", "Civil", "Nos", "450,000", "0"),
        ("Tank installation, 35 KL, RCC pit (civil)", "Civil", "Nos", "550,000", "0"),
        ("16 KL SS tank (unit)", "Plant & Machinery", "EA", "200,000", "1"),
        ("22 KL SS tank (unit)", "Plant & Machinery", "EA", "220,000", "0"),
        ("35 KL SS tank (unit)", "Plant & Machinery", "EA", "320,000", "0"),
    ],
    "Electric Panel": [
        ("PMCC Panel", "Plant & Machinery", "LS", "100,000", "1"),
        ("Cable (3C x 2.5 / 4C x 2.5 SQMM)", "Plant & Machinery", "RMT", "160", "800"),
        ("Power Conditioner", "Plant & Machinery", "EA", "80,000", "1"),
        ("Earth pits", "Plant & Machinery", "Nos", "8,000", "10"),
    ],
}

for type_name, rows in RATE_CARDS.items():
    h3(type_name)
    data = [["Line item", "Bucket", "UoM", "Rate (Rs)", "Default qty"]] + list(rows)
    rt = Table(data, colWidths=[62*mm, 32*mm, 18*mm, 28*mm, 28*mm])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2c5a8c")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, ALT_FILL]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#cfd9e3")),
        ("ALIGN", (3,0), (4,-1), "RIGHT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    story.append(rt)
    story.append(Spacer(1, 8))

story.append(PageBreak())

# ---------------------------------------------------------------------------
# Section 5: API reference
# ---------------------------------------------------------------------------
h2("5. API route reference")
PFX = "/api/outlets/:id/modernisation-requests"  # common long segment, broken out so paths wrap cleanly
api_rows_raw = [
    ["1", "POST /api/dealer-requests", "{ outletId, category: \"Modernisation\", modernisationType, subject, description }"],
    ["2", "GET /api/outlets/:id/report", "—"],
    ["3", f"POST {PFX}<br/>/:reqId/cost-estimate", "{ lineItems: [{ id, qty, rate }] }"],
    ["4", f"POST {PFX}<br/>/:reqId/irr", "{ incrementalVolumeKLPerMonth, horizonYears, ... }"],
    ["5", f"POST {PFX}<br/>/:reqId/justification", "{ soJustification }"],
    ["6", f"POST {PFX}<br/>/:reqId/decision", "{ decision: \"Approved\"|\"Rejected\", justification, decidedBy }"],
    ["7", f"POST {PFX}<br/>/:reqId/eam", "{ approve: true|false }"],
    ["8", f"GET {PFX}<br/>/:reqId/file-note.pdf", "— (binary PDF response)"],
    ["9", f"POST {PFX}<br/>/:reqId/weekly-check", "{ actualKL }"],
]
path_style = ParagraphStyle(name="PathCell", fontName="Courier", fontSize=7.6, leading=10)
body_style = ParagraphStyle(name="BodyCell", fontName="Courier", fontSize=7.6, leading=10)
api_rows = [["Step", "Method & path", "Body"]] + [
    [Paragraph(r[0], styles["CellBody"]), Paragraph(r[1], path_style), Paragraph(r[2], body_style)] for r in api_rows_raw
]
at = Table(api_rows, colWidths=[12*mm, 88*mm, 72*mm])
at.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1a3a5c")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, ALT_FILL]),
    ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#cfd9e3")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
]))
story.append(at)
story.append(Spacer(1, 14))

# ---------------------------------------------------------------------------
# Section 6: gates & guardrails
# ---------------------------------------------------------------------------
h2("6. Gates &amp; guardrails built into the workflow")
gate_items = [
    "A Modernisation Request can only be created for an <b>Operational</b> outlet &mdash; blocked otherwise.",
    "The SO <b>cannot record a decision</b> until both the IRR has been computed and a justification has been entered.",
    "<b>Rejecting</b> a request is a dead end by design: no File Note, no Budget Note, no EAM step is generated.",
    "SO approval and <b>EAM approval are two separate, independently recorded decisions</b> &mdash; an SO-approved request still needs EAM sign-off before it's fully through.",
    "Only an <b>EAM-approved Canopy</b> request flips the outlet's own canopy asset flag &mdash; other types don't carry that side-effect.",
    "The File Note PDF download only appears <b>after</b> the SO approves (the file note doesn't exist before that).",
    "Editing the cost estimate after an IRR has already been computed <b>automatically recomputes</b> the IRR against the new total investment, so a stale IRR can never be approved against changed numbers.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(x, styles["BodyCustom"]), leftIndent=10) for x in gate_items],
    bulletType="bullet", start="•",
))

story.append(Spacer(1, 14))

# ---------------------------------------------------------------------------
# Section 7: production integration notes
# ---------------------------------------------------------------------------
h2("7. Production integration notes (not yet wired in this prototype)")
body(
    "This prototype's Outlet Repository (Module 1) and Trading Area snapshot are seeded from real HPCL "
    "workbooks supplied for this project, not from live system calls. In a production deployment, the "
    "following integrations should replace that static data:"
)
integration_items = [
    "<b>Outlet details</b> (SAP code, dealer name, district, sales area, class of market, etc.) used when "
    "generating a proposal &mdash; the File Note and Budget Approval Note at step 6 &mdash; should be "
    "fetched from the <b>Outlet Repository (Module 1) or directly from SAP</b> master data, not re-keyed "
    "by the SO.",
    "<b>Trading Area details</b> (the dealer-wise competitive volumes behind Module 1's Trading Area "
    "snapshot, which this proposal's cost/IRR case can reference) should be fetched from "
    "<b>TIBCO</b> for real-time sales-area/competitor data, rather than the static Market Share report "
    "snapshot this prototype uses today.",
    "Once a Budget Approval Note is generated (step 6, on SO approval), the workflow should "
    "<b>redirect into the e-Proposal module</b> for formal submission, routing and tracking, instead of "
    "ending at a PDF download as this prototype does today.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(x, styles["BodyCustom"]), leftIndent=10) for x in integration_items],
    bulletType="bullet", start="•",
))

doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=16*mm, rightMargin=16*mm, topMargin=16*mm, bottomMargin=16*mm,
    title="Modernisation Request Workflow — Retail Setu",
)
doc.build(story)
print("wrote", OUT)
