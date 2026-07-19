import type {
  DealerCase,
  CaseType,
  RosterEntry,
  ApplicationForm,
  AscResult,
  AscRecommendation,
  LecResult,
  FvcResult,
  YesNo,
  MilestoneKey,
  MilestoneStatus,
  GanttTask,
  Outlet,
  CanopyRequest,
} from "../types.js";
import { store, nextId, freshMilestones } from "../store.js";
import { getAiEngine } from "./aiEngine.js";
import { matchClauses } from "./policyBot.js";
import { ASC_CHECKLIST_TEMPLATE, LEC_EVALUATION_TEMPLATE, FVC_ITEMS_TEMPLATE, formatAscReport, formatLecReport, formatFvcReport } from "./dsgForms.js";

export class WorkflowError extends Error {}

function getCase(caseId: string): DealerCase {
  const c = store.dealerCases.get(caseId);
  if (!c) throw new WorkflowError(`Dealer case ${caseId} not found`);
  return c;
}

export function listCases(): DealerCase[] {
  return [...store.dealerCases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCaseById(caseId: string): DealerCase {
  return getCase(caseId);
}

// Step 1 — Stretch identification (KML-driven — see services/kml.ts for real KML/KMZ parsing).
// caseType defaults to fresh-site development; pass "Resitement" + existingOutletId/groundsSelected/
// dealerRequestText to open a relocation case for an already-commissioned outlet instead.
export function createCase(input: {
  salesArea: string;
  stretchName: string;
  kmlFileName?: string;
  competitorContext: string;
  caseType?: CaseType;
  existingOutletId?: string;
  groundsSelected?: string[];
  dealerRequestText?: string;
}): DealerCase {
  const caseType: CaseType = input.caseType ?? "NewSiteDevelopment";
  const dealerCase: DealerCase = {
    id: nextId("CASE"),
    caseType,
    salesArea: input.salesArea,
    stretchName: input.stretchName,
    kmlFileName: input.kmlFileName,
    competitorContext: input.competitorContext,
    stage: "StretchIdentification",
    createdAt: new Date().toISOString(),
    roster: [],
    inspections: {},
    milestones: [],
    activityLog: [],
  };
  if (caseType === "Resitement") {
    if (!input.existingOutletId) throw new WorkflowError("existingOutletId is required for a Resitement case");
    const existingOutlet = store.outlets.get(input.existingOutletId);
    if (!existingOutlet) throw new WorkflowError(`Outlet ${input.existingOutletId} not found`);
    dealerCase.resitement = {
      existingOutletId: input.existingOutletId,
      existingOutletName: existingOutlet.name,
      groundsSelected: input.groundsSelected ?? [],
      dealerRequestText: input.dealerRequestText ?? "",
      dealerRequestDate: new Date().toISOString().slice(0, 10),
      technicalEvaluationCommittee: [],
    };
    dealerCase.outletId = input.existingOutletId;
  }
  store.dealerCases.set(dealerCase.id, dealerCase);
  store.logActivity(
    dealerCase,
    "SO",
    caseType === "Resitement" ? "Resitement case opened" : "Case created from stretch identification",
    input.stretchName,
  );
  return dealerCase;
}

// Resitement-only: appoint the technical evaluation committee and generate its report (HQO circular
// RET/TRB / Retail/2025/018 mandate a 3-member committee to visit existing + proposed sites).
export function addResitementCommitteeMember(caseId: string, name: string, designation: string): DealerCase {
  const c = getCase(caseId);
  if (!c.resitement) throw new WorkflowError("Case is not a Resitement case");
  c.resitement.technicalEvaluationCommittee.push({ name, designation });
  store.logActivity(c, "System", "Technical evaluation committee member added", `${designation} (${name})`);
  return c;
}

export async function generateTechnicalEvaluationReport(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  if (!c.resitement) throw new WorkflowError("Case is not a Resitement case");
  const existingOutlet = store.outlets.get(c.resitement.existingOutletId);
  const salesTrend = existingOutlet
    ? `${existingOutlet.name} — current benchmark ${existingOutlet.taAverageKL} KL/month (see Module 3 predictive analytics for the live sales trend).`
    : "Existing outlet sales trend unavailable.";
  const text = await getAiEngine().generate("technicalEvaluationReport", {
    existingOutletName: c.resitement.existingOutletName,
    groundsSelected: c.resitement.groundsSelected,
    committee: c.resitement.technicalEvaluationCommittee,
    salesTrend,
    stretchName: c.stretchName,
  });
  c.resitement.technicalEvaluationReportText = text;
  c.resitement.technicalEvaluationDate = new Date().toISOString().slice(0, 10);
  store.logActivity(c, "AI", "Technical evaluation report generated");
  return c;
}

// Step 2 — Feasibility report + roster.
export function setRoster(caseId: string, entries: Omit<RosterEntry, "id">[]): DealerCase {
  const c = getCase(caseId);
  c.roster = entries.map((e) => ({ ...e, id: nextId("ROS") }));
  c.stage = "Roster";
  store.logActivity(c, "SO", "Roster updated", `${c.roster.length} candidate site(s)`);
  return c;
}

export async function generateFeasibilityReport(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  const text = await getAiEngine().generate("feasibilityReport", {
    stretchName: c.stretchName,
    competitorContext: c.competitorContext,
    roster: c.roster,
  });
  const feasible = c.roster.some((r) => r.feasible);
  c.feasibilityReport = { text, feasible, generatedAt: new Date().toISOString() };
  c.stage = "FeasibilityReport";
  store.logActivity(c, "AI", "Feasibility report generated", feasible ? "Feasible" : "Not feasible");
  return c;
}

// Step 3 — Application intake.
export function submitApplication(caseId: string, application: ApplicationForm): DealerCase {
  const c = getCase(caseId);
  c.application = application;
  c.stage = "ApplicationIntake";
  store.logActivity(c, "SO", "Application form recorded", application.applicantName);
  return c;
}

// Step 4 — ASC / LEC / FVC inspections, in the real DSG Annexure V / W1 / Y formats.
// Every field also captured on the Application Form is auto-populated from it here —
// the committee only enters its own Yes/No findings, deficiencies and recommendation.

function applicationOrThrow(c: DealerCase): ApplicationForm {
  if (!c.application) throw new WorkflowError("Application form must be submitted before ASC/LEC/FVC can be carried out");
  return c.application;
}

export function submitAsc(
  caseId: string,
  itemAnswers: Record<string, YesNo>,
  rectifiableDeficiencies: string[],
  nonRectifiableDeficiencies: string[],
  recommendation: AscRecommendation,
  member1: string,
  member2: string,
): DealerCase {
  const c = getCase(caseId);
  const app = applicationOrThrow(c);
  const result: AscResult = {
    kind: "ASC",
    applicationFormNo: app.applicationNo,
    applicantName: app.applicantName,
    fatherOrSpouseName: app.fatherOrSpouseName,
    location: c.stretchName,
    district: app.district,
    state: app.state,
    category: app.applicantCategory,
    typeOfRO: app.typeOfRO,
    items: ASC_CHECKLIST_TEMPLATE.map((t) => ({ ...t, answer: itemAnswers[t.id] ?? "" })),
    rectifiableDeficiencies,
    nonRectifiableDeficiencies,
    recommendation,
    member1,
    member2,
    completedAt: new Date().toISOString(),
    reportText: "",
  };
  result.reportText = formatAscReport(result);
  c.inspections.asc = result;
  c.stage = "SiteInspections";
  store.logActivity(c, "SO", "ASC (Application Scrutiny Committee) report recorded", recommendation);
  return c;
}

export function submitLec(
  caseId: string,
  evaluationAnswers: Record<string, YesNo>,
  siteFields: {
    distanceFromLandmarkM: string;
    landmarkName: string;
    distanceEdgeFromCenterLineM: string;
    rowWidthM: string;
    roadNameOrNo: string;
    latLong: string;
  },
  layoutMatchesApplication: YesNo,
  layoutDeviationNotes: string,
  recommendationSuitable: YesNo,
  reasonsIfNotSuitable: string[],
  member1: string,
  member2: string,
  member3: string,
): DealerCase {
  const c = getCase(caseId);
  const app = applicationOrThrow(c);
  const result: LecResult = {
    kind: "LEC",
    advertisedLocation: c.stretchName,
    regularOrRural: app.typeOfRO,
    category: app.applicantCategory,
    landPlotNo: app.landKhasraKhatouniNo,
    revenueVillage: app.revenueVillage,
    tehsil: app.tehsil,
    district: app.district,
    state: app.state,
    frontageM: app.frontageM,
    depthM: app.depthM,
    areaSqM: app.areaSqM,
    applicantName: app.applicantName,
    ...siteFields,
    evaluationItems: LEC_EVALUATION_TEMPLATE.map((t) => ({ ...t, answer: evaluationAnswers[t.id] ?? "" })),
    layoutMatchesApplication,
    layoutDeviationNotes,
    recommendationSuitable,
    reasonsIfNotSuitable,
    member1,
    member2,
    member3,
    completedAt: new Date().toISOString(),
    reportText: "",
  };
  result.reportText = formatLecReport(result);
  c.inspections.lec = result;
  c.stage = "SiteInspections";
  store.logActivity(c, "SO", "LEC (Land Evaluation Committee) report recorded", recommendationSuitable === "Yes" ? "Suitable" : "Not suitable");
  return c;
}

export function submitFvc(
  caseId: string,
  itemAnswers: Record<number, { documentsProvidedByApplicant: YesNo; verifiedCorrect: "Correct" | "Incorrect" | ""; comments: string }>,
  anyOtherRemarks: string,
  member1: string,
  member2: string,
): DealerCase {
  const c = getCase(caseId);
  const app = applicationOrThrow(c);
  const result: FvcResult = {
    kind: "FVC",
    advertisedLocation: c.stretchName,
    district: app.district,
    state: app.state,
    category: app.applicantCategory,
    applicationFormNo: app.applicationNo,
    applicantFullName: app.applicantName,
    residentialAddress: app.address,
    items: FVC_ITEMS_TEMPLATE.map((t) => ({
      ...t,
      documentsProvidedByApplicant: itemAnswers[t.itemNo]?.documentsProvidedByApplicant ?? "",
      verifiedCorrect: itemAnswers[t.itemNo]?.verifiedCorrect ?? "",
      comments: itemAnswers[t.itemNo]?.comments ?? "",
    })),
    anyOtherRemarks,
    member1,
    member2,
    completedAt: new Date().toISOString(),
    reportText: "",
  };
  result.reportText = formatFvcReport(result);
  c.inspections.fvc = result;
  c.stage = "SiteInspections";
  store.logActivity(c, "SO", "FVC (Field Verification of Credentials) report recorded");
  return c;
}

// Step 5 — AI-generated file note, modelled on HPCL's real "Approved File Note" SAP workflow:
// a routing chain (Initiation -> Recommendation/Approval) where each stage appends its own
// timestamped remarks rather than one flat note body.
export async function generateFileNote(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  const policyClauses = matchClauses(`${c.stretchName} dealer selection land eligibility financial ASC resitement budget`, 5);
  const initiationRemarks = await getAiEngine().generate("fileNote", {
    stretchName: c.stretchName,
    application: c.application ?? undefined,
    inspections: c.inspections,
    policyClauses,
  });
  const so = [...store.team.values()].find((t) => t.role === "SO");
  c.fileNote = {
    systemId: nextId("SYS"),
    initiatedOn: new Date().toISOString().slice(0, 10),
    subject: `Approval for ${c.caseType === "Resitement" ? "resitement of" : "dealer selection at"} ${c.stretchName}`,
    routing: [
      {
        id: nextId("RT"),
        role: "Initiation",
        actorName: so?.name ?? "Sales Officer",
        actorTitle: "Sales Officer",
        remarks: initiationRemarks,
        timestamp: new Date().toISOString(),
      },
    ],
    policyClausesCited: policyClauses.map((p) => `${p.documentTitle} ${p.clauseNumber}`),
    status: "Draft",
    generatedAt: new Date().toISOString(),
  };
  c.stage = "FileNoteApproval";
  store.logActivity(c, "AI", "File note initiated", `${policyClauses.length} clause(s) cited`);
  return c;
}

export function decideFileNote(caseId: string, approve: boolean, approvedBy: string, actorTitle: string, remarks?: string): DealerCase {
  const c = getCase(caseId);
  if (!c.fileNote) throw new WorkflowError("File note has not been generated yet");
  c.fileNote.routing.push({
    id: nextId("RT"),
    role: "Approval",
    actorName: approvedBy,
    actorTitle,
    remarks: remarks || (approve ? "Approved." : "Rejected."),
    timestamp: new Date().toISOString(),
  });
  c.fileNote.status = approve ? "Approved" : "Rejected";
  store.logActivity(c, approvedBy, `File note ${approve ? "approved" : "rejected"}`);
  return c;
}

// Step 6 — LOI generation (per Dealer Selection Guidelines format) + milestone tracking init.
export async function generateLOI(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  if (!c.fileNote || c.fileNote.status !== "Approved") {
    throw new WorkflowError("File note must be approved before LOI can be issued");
  }
  const text = await getAiEngine().generate("loi", {
    applicantName: c.application?.applicantName ?? "Applicant",
    stretchName: c.stretchName,
    salesArea: c.salesArea,
  });
  c.loi = { text, issuedAt: new Date().toISOString() };
  c.milestones = freshMilestones();
  c.stage = "LOIIssued";
  store.logActivity(c, "AI", "LOI generated and issued");
  return c;
}

// Step 7 — 2-way milestone tracking through to NOC.
export async function updateMilestone(
  caseId: string,
  key: MilestoneKey,
  status: MilestoneStatus,
  notes?: string,
  departments?: string[],
): Promise<DealerCase> {
  const c = getCase(caseId);
  const m = c.milestones.find((x) => x.key === key);
  if (!m) throw new WorkflowError(`Milestone ${key} not initialised for this case`);
  m.status = status;
  m.date = new Date().toISOString();
  if (notes) m.notes = notes;
  if (departments) m.departments = departments;
  c.stage = "MilestoneTracking";
  store.logActivity(c, "Company/DM", `Milestone "${m.label}" -> ${status}`, notes);
  if (key === "NOCReceived" && status === "Done") {
    await generateLeaseAgreement(c.id);
    await generateDealershipAgreement(c.id);
  }
  return c;
}

// Auto-generated on NOC receipt (and, as a fallback, at commissioning) — grounded in the real
// registered lease deed and Dealership Agreement templates.
export async function generateLeaseAgreement(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  if (c.leaseAgreement) return c;
  const leaseTermYears = 20;
  const monthlyRent = 40000;
  const landDetails = c.application
    ? `${c.application.landKhasraKhatouniNo}, Village ${c.application.revenueVillage}, Tehsil ${c.application.tehsil}, District ${c.salesArea.replace(/ SA$/, "")}`
    : c.stretchName;
  const lessorName = c.resitement ? "Landowner of record (new site)" : "Landowner of record";
  const text = await getAiEngine().generate("leaseAgreement", {
    outletName: c.stretchName,
    lessorName,
    landDetails,
    leaseTermYears,
    monthlyRent,
  });
  c.leaseAgreement = { text, generatedAt: new Date().toISOString(), lessorName, landDetails, leaseTermYears, monthlyRent };
  store.logActivity(c, "AI", "Lease agreement auto-generated on NOC receipt");
  return c;
}

export async function generateDealershipAgreement(caseId: string): Promise<DealerCase> {
  const c = getCase(caseId);
  if (c.dealershipAgreement) return c;
  const tenureYears = 15;
  const dealerName = c.application?.applicantName ?? c.resitement?.existingOutletName ?? "Dealer (to be appointed)";
  const text = await getAiEngine().generate("dealershipAgreement", {
    outletName: c.stretchName,
    dealerName,
    tenureYears,
    salesArea: c.salesArea,
  });
  c.dealershipAgreement = { text, generatedAt: new Date().toISOString(), dealerName, tenureYears };
  store.logActivity(c, "AI", "Dealership agreement auto-generated on NOC receipt");
  return c;
}

export function stuckMilestones(): { caseId: string; stretchName: string; milestoneLabel: string }[] {
  const out: { caseId: string; stretchName: string; milestoneLabel: string }[] = [];
  for (const c of store.dealerCases.values()) {
    for (const m of c.milestones) {
      if (m.status === "Stuck") out.push({ caseId: c.id, stretchName: c.stretchName, milestoneLabel: m.label });
    }
  }
  return out;
}

// Step 8 — NOC received -> MDM & SAP customer master sync.
export function syncCustomerMaster(caseId: string): DealerCase {
  const c = getCase(caseId);
  const noc = c.milestones.find((m) => m.key === "NOCReceived");
  if (!noc || noc.status !== "Done") throw new WorkflowError("NOC must be received before customer master sync");
  c.customerMaster = {
    syncedToMDM: true,
    syncedToSAP: true,
    customerCode: `CUST-${c.id.split("-")[1]}`,
    syncedAt: new Date().toISOString(),
  };
  c.stage = "CustomerMasterSync";
  store.logActivity(c, "System", "Customer master synced to MDM & SAP", c.customerMaster.customerCode);
  return c;
}

// Step 9 — Budget approval / IRR / cost estimate (AI-generated note).
export async function generateBudget(caseId: string, costEstimate: number, irr: number): Promise<DealerCase> {
  const c = getCase(caseId);
  if (!c.customerMaster) throw new WorkflowError("Customer master must be synced before budget approval");
  const noteText = await getAiEngine().generate("budgetNote", {
    costEstimate,
    irr,
    context: `New outlet development — ${c.stretchName}, ${c.salesArea}`,
  });
  c.budget = { costEstimate, irr, noteText, status: "Submitted" };
  c.stage = "BudgetApproval";
  store.logActivity(c, "AI", "Budget approval note generated", `Cost ${costEstimate}, IRR ${irr}%`);
  return c;
}

export function decideBudget(caseId: string, approve: boolean): DealerCase {
  const c = getCase(caseId);
  if (!c.budget) throw new WorkflowError("Budget note has not been generated yet");
  c.budget.status = approve ? "Approved" : "Rejected";
  c.budget.approvedAt = new Date().toISOString();
  if (approve) {
    c.project = { ganttTasks: buildGanttTasks(new Date()), estimatedCommissionDate: estimateCommissionDate() };
    c.stage = "ProjectExecution";
  }
  store.logActivity(c, "RetailHead", `Budget ${approve ? "approved" : "rejected"}`);
  return c;
}

const STANDARD_PROJECT_TASKS = [
  { name: "Site development & boundary wall", days: 20 },
  { name: "Civil construction — canopy & building", days: 35 },
  { name: "Equipment installation (DU, tanks, piping)", days: 20 },
  { name: "Statutory inspection & PESO clearance", days: 10 },
  { name: "Testing & commissioning", days: 7 },
];

function buildGanttTasks(start: Date): GanttTask[] {
  let cursor = new Date(start);
  const tasks: GanttTask[] = [];
  let prevId: string | undefined;
  for (const t of STANDARD_PROJECT_TASKS) {
    const startDate = new Date(cursor);
    const endDate = new Date(cursor);
    endDate.setDate(endDate.getDate() + t.days);
    const id = nextId("GT");
    tasks.push({
      id,
      name: t.name,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      status: "NotStarted",
      dependency: prevId,
    });
    prevId = id;
    cursor = endDate;
  }
  return tasks;
}

function estimateCommissionDate(): string {
  const totalDays = STANDARD_PROJECT_TASKS.reduce((a, t) => a + t.days, 0);
  const d = new Date();
  d.setDate(d.getDate() + totalDays);
  return d.toISOString().slice(0, 10);
}

// Step 10 — Commissioning: converts the case into a live Outlet record and starts sales tracking.
// (For a Resitement case this instead re-points the existing outlet at the new site.)
export async function commissionCase(caseId: string): Promise<{ dealerCase: DealerCase; outlet: Outlet }> {
  const c = getCase(caseId);
  if (c.stage !== "ProjectExecution") throw new WorkflowError("Case must be in project execution before commissioning");
  // Fallback in case NOC-triggered auto-generation was skipped for this case.
  await generateLeaseAgreement(c.id);
  await generateDealershipAgreement(c.id);

  if (c.resitement) {
    const existing = store.outlets.get(c.resitement.existingOutletId);
    if (!existing) throw new WorkflowError(`Existing outlet ${c.resitement.existingOutletId} not found`);
    existing.masterSheet["Resited From"] = existing.masterSheet["Location"] ?? existing.district;
    existing.masterSheet["Resited To"] = c.stretchName;
    existing.masterSheet["Resitement Case"] = c.id;
    existing.status = "Operational";
    existing.nozzleSalesStarted = true;
    existing.commissionedDate = new Date().toISOString().slice(0, 10);
    c.outletId = existing.id;
    c.stage = "Commissioned";
    store.logActivity(c, "System", "Outlet resited — Nozzle Sales Started at new site", existing.id);
    return { dealerCase: c, outlet: existing };
  }

  const outletId = nextId("OUT");
  const outlet: Outlet = {
    id: outletId,
    name: c.application?.applicantName ? `HPCL ${c.stretchName} (${c.application.applicantName})` : `HPCL ${c.stretchName}`,
    salesArea: c.salesArea,
    district: c.salesArea.replace(/ SA$/, ""),
    company: "HPCL",
    status: "Operational",
    dealerName: c.application?.applicantName,
    location: { lat: 0, lng: 0 },
    masterSheet: {
      "Source Case": c.id,
      "Land Details": c.application?.landDetails ?? "",
      "Revenue Village": c.application?.revenueVillage ?? "",
      Tehsil: c.application?.tehsil ?? "",
    },
    fixedAssets: [],
    taAverageKL: 100,
    canopy: false,
    nozzleSalesStarted: true,
    commissionedDate: new Date().toISOString().slice(0, 10),
    linkedCaseId: c.id,
  };
  store.outlets.set(outletId, outlet);
  c.outletId = outletId;
  c.stage = "Commissioned";
  store.logActivity(c, "System", "Outlet commissioned — Nozzle Sales Started", outletId);
  return { dealerCase: c, outlet };
}

// ---------------------------------------------------------------------------
// Canopy addition sub-workflow — available to ANY operational outlet (not only
// ones this system happened to commission through a live Module 2 case), since
// in reality any existing dealership can submit a request-cum-commitment
// proposal from the portal. Generates both a routing-chain file note and the
// EAM/RBC-style budget note, matching the pattern used for new-site cases.
// ---------------------------------------------------------------------------

function outletOrThrow(outletId: string): Outlet {
  const o = store.outlets.get(outletId);
  if (!o) throw new WorkflowError(`Outlet ${outletId} not found`);
  return o;
}

export function requestCanopy(outletId: string, committedVolumeKL: number, costEstimate: number, irr: number, dealerJustification: string): Outlet {
  const outlet = outletOrThrow(outletId);
  if (outlet.status !== "Operational") throw new WorkflowError("Canopy requests are only available for operational outlets");
  const req: CanopyRequest = {
    id: nextId("CANOPY"),
    requestedAt: new Date().toISOString(),
    committedVolumeKL,
    costEstimate,
    irr,
    dealerJustification,
    weeklyPerformance: [],
  };
  outlet.canopyRequest = req;
  return outlet;
}

export async function decideCanopyRequest(
  outletId: string,
  decision: "Approved" | "Rejected",
  justification: string,
  decidedBy: string,
): Promise<Outlet> {
  const outlet = outletOrThrow(outletId);
  const req = outlet.canopyRequest;
  if (!req) throw new WorkflowError("No canopy request on this outlet");
  req.soDecision = { decision, justification, decidedBy, decidedAt: new Date().toISOString() };
  if (decision === "Approved") {
    const policyClauses = matchClauses("canopy budget eam corpus fund working capital", 3);
    const fileNoteRemarks = await getAiEngine().generate("canopyFileNote", {
      outletName: outlet.name,
      committedVolumeKL: req.committedVolumeKL,
      costEstimate: req.costEstimate,
      irr: req.irr,
      dealerJustification: req.dealerJustification,
      policyClauses,
    });
    req.fileNote = {
      systemId: nextId("SYS"),
      initiatedOn: new Date().toISOString().slice(0, 10),
      subject: `Approval for canopy addition — ${outlet.name}`,
      routing: [
        {
          id: nextId("RT"),
          role: "Initiation",
          actorName: decidedBy,
          actorTitle: "Sales Officer",
          remarks: fileNoteRemarks,
          timestamp: new Date().toISOString(),
        },
        {
          id: nextId("RT"),
          role: "Approval",
          actorName: decidedBy,
          actorTitle: "Sales Officer",
          remarks: justification || "Approved.",
          timestamp: new Date().toISOString(),
        },
      ],
      policyClausesCited: policyClauses.map((p) => `${p.documentTitle} ${p.clauseNumber}`),
      status: "Approved",
      generatedAt: new Date().toISOString(),
    };
    req.budgetNoteText = await getAiEngine().generate("canopyBudgetNote", {
      outletName: outlet.name,
      committedVolumeKL: req.committedVolumeKL,
      costEstimate: req.costEstimate,
      irr: req.irr,
      dealerJustification: req.dealerJustification,
    });
    req.eamStatus = "Pending";
    req.projectTimeline = buildGanttTasks(new Date()).slice(0, 3); // canopy build is a lighter project
  }
  return outlet;
}

export function decideCanopyEAM(outletId: string, approve: boolean): Outlet {
  const outlet = outletOrThrow(outletId);
  if (!outlet.canopyRequest) throw new WorkflowError("No canopy request on this outlet");
  outlet.canopyRequest.eamStatus = approve ? "Approved" : "Rejected";
  if (approve) outlet.canopy = true;
  return outlet;
}

/** Weekly job: compares committed vs actual volume and records whether the dealer is on track. */
export function recordWeeklyCanopyPerformance(outletId: string, actualKL: number): Outlet {
  const outlet = outletOrThrow(outletId);
  if (!outlet.canopyRequest) throw new WorkflowError("No canopy request on this outlet");
  const weekOf = new Date().toISOString().slice(0, 10);
  outlet.canopyRequest.weeklyPerformance.push({
    weekOf,
    committedKL: outlet.canopyRequest.committedVolumeKL,
    actualKL,
    onTrack: actualKL >= outlet.canopyRequest.committedVolumeKL * 0.9,
    emailSent: true,
  });
  return outlet;
}
