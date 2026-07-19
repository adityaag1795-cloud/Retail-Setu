/**
 * Domain model for the Retail Network Ops prototype.
 *
 * Scope mirrors the six modules from the source brief:
 *   1. Outlet Data Repository
 *   2. Dealer Selection & Development workflow (incl. canopy addition sub-flow)
 *   3. Predictive Analysis (CRIS-fed dashboard)
 *   4. Teams Communication / KPI tracker
 *   5. SO Cockpit (aggregated task + calendar view)
 *   6. Knowledge Centre (policy bot)
 */

export type ID = string;

export type OilCompany = "HPCL" | "IOCL" | "BPCL" | "Other";

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Module 1 — Outlet Data Repository
// ---------------------------------------------------------------------------

export type OutletStatus = "Prospective" | "UnderDevelopment" | "Operational" | "Closed";

export interface Outlet {
  id: ID;
  name: string;
  salesArea: string; // e.g. "Faridabad SA"
  district: string;
  company: OilCompany;
  status: OutletStatus;
  dealerName?: string;
  location: GeoPoint;
  /** Free-form "master sheet" fields — real shape to be supplied by the business owner. */
  masterSheet: Record<string, string>;
  fixedAssets: FixedAssetItem[];
  taAverageKL: number; // trading-area benchmark, monthly KL
  canopy: boolean;
  nozzleSalesStarted: boolean;
  commissionedDate?: string;
  linkedCaseId?: ID; // link back to the Module 2 DealerCase that created this outlet, if any
  /** Canopy addition sub-workflow — available to any operational outlet, not only ones this system commissioned. */
  canopyRequest?: CanopyRequest;
}

/** Field names mirror HPCL's real SAP Fixed Asset Individual Listing (FAIL) export. */
export interface FixedAssetItem {
  id: ID;
  outletId: ID;
  assetClassDescription: string; // e.g. "Freehold Land", "RTU L/H Land", "Plant & Machinery"
  assetDescription: string;
  grossBlock: number;
  depreciationReserve: number;
  netBookValue: number;
  usefulLifeYears: number;
  capitalizedOn: string; // date
}

export type CommDirection = "Inbound" | "Outbound";

export interface Communication {
  id: ID;
  outletId: ID;
  date: string;
  direction: CommDirection;
  channel: "Letter" | "Email" | "Notice" | "Scan";
  subject: string;
  summary: string;
  /** Simulated PDF artifact name — a real deployment would attach the scanned file. */
  pdfRecordName: string;
  scanCopy: boolean;
}

// ---------------------------------------------------------------------------
// Module 2 — Dealer Selection & Development workflow
// ---------------------------------------------------------------------------

export const DEALER_CASE_STAGES = [
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
] as const;

export type DealerCaseStage = (typeof DEALER_CASE_STAGES)[number];

export interface RosterEntry {
  id: ID;
  candidateName: string;
  location: string;
  priority: number;
  feasible: boolean;
  remarks: string;
}

/**
 * Field set mirrors HPCL's real "Application for Retail Outlet Dealership" form
 * (individual applicant) — category/group/land-schedule fields drive Dealer
 * Selection Guideline eligibility checks downstream.
 */
export interface ApplicationForm {
  applicationNo: string;
  applicantName: string;
  fatherOrSpouseName: string;
  spouseName?: string;
  address: string;
  district: string;
  state: string;
  applicantCategory: "OPEN" | "SC" | "ST" | "OBC" | "PH" | "DP" | "ExSM" | "Other";
  group: "Group 1" | "Group 2" | "Group 3";
  typeOfRO: "Regular" | "Rural";
  ownershipType: "Owned" | "Leased" | "Family" | "Other";
  landKhasraKhatouniNo: string;
  revenueVillage: string;
  tehsil: string;
  frontageM: number;
  depthM: number;
  areaSqM: number;
  landDetails: string;
  otherFields: Record<string, string>;
}

/**
 * ASC / LEC / FVC — real HPCL Dealer Selection Guidelines 2023 formats
 * (Annexure V "Format for Scrutiny of Applications for RO Dealership" for
 * ASC, Annexure W1 "Format for Land Evaluation by LEC" for LEC, Annexure Y
 * "Format for Field Verification of Credentials" for FVC). Every field that
 * also appears on the Application Form is auto-populated from it by
 * dealerWorkflow.ts — only the committee's own findings are entered by hand.
 */
export type YesNo = "Yes" | "No" | "";

/** Annexure V eligibility checklist (19 objective items + free-text deficiencies + recommendation). */
export interface AscChecklistItem {
  id: string; // Annexure V S.No, e.g. "1".."19"
  particular: string;
  applicability: string;
  answer: YesNo;
}

export type AscRecommendation =
  | "Eligible"
  | "Ineligible"
  | "Eligible Subject to Rectification of Deficiencies"
  | "To be considered under Group-3"
  | "";

export interface AscResult {
  kind: "ASC";
  /** Auto-populated from ApplicationForm. */
  applicationFormNo: string;
  applicantName: string;
  fatherOrSpouseName: string;
  location: string;
  district: string;
  state: string;
  category: string;
  typeOfRO: "Regular" | "Rural";
  /** Committee's own findings. */
  items: AscChecklistItem[];
  rectifiableDeficiencies: string[];
  nonRectifiableDeficiencies: string[];
  recommendation: AscRecommendation;
  member1: string;
  member2: string;
  completedAt: string;
  /** Formatted to mirror the real Annexure V layout. */
  reportText: string;
}

/** Annexure W1 site evaluation parameters (4 objective criteria + suitability recommendation). */
export interface LecEvaluationItem {
  id: string; // "1a" .. "4"
  criterion: string;
  answer: YesNo;
}

export interface LecResult {
  kind: "LEC";
  /** Auto-populated from ApplicationForm / case. */
  advertisedLocation: string;
  regularOrRural: "Regular" | "Rural";
  category: string;
  landPlotNo: string;
  revenueVillage: string;
  tehsil: string;
  district: string;
  state: string;
  frontageM: number;
  depthM: number;
  areaSqM: number;
  applicantName: string;
  /** LEC's own on-site findings. */
  distanceFromLandmarkM: string;
  landmarkName: string;
  distanceEdgeFromCenterLineM: string;
  rowWidthM: string;
  roadNameOrNo: string;
  latLong: string;
  evaluationItems: LecEvaluationItem[];
  layoutMatchesApplication: YesNo;
  layoutDeviationNotes: string;
  recommendationSuitable: YesNo;
  reasonsIfNotSuitable: string[];
  member1: string;
  member2: string;
  member3: string;
  completedAt: string;
  reportText: string;
}

/** Annexure Y — 9-item credential verification table. */
export interface FvcVerificationItem {
  itemNo: number;
  particularsToBeVerified: string;
  documentsToBeVerified: string;
  documentsProvidedByApplicant: YesNo;
  verifiedCorrect: "Correct" | "Incorrect" | "";
  comments: string;
}

export interface FvcResult {
  kind: "FVC";
  /** Auto-populated from ApplicationForm / case. */
  advertisedLocation: string;
  district: string;
  state: string;
  category: string;
  applicationFormNo: string;
  applicantFullName: string;
  residentialAddress: string;
  /** FVC officers' own findings. */
  items: FvcVerificationItem[];
  anyOtherRemarks: string;
  member1: string;
  member2: string;
  completedAt: string;
  reportText: string;
}

/**
 * Mirrors HPCL's real "Approved File Note" SAP workflow document: a fixed
 * approval chain where each stage appends timestamped free-text remarks
 * rather than one flat note body.
 */
export type FileNoteStageRole = "Initiation" | "Recommendation" | "Approval";

export interface FileNoteRoutingStage {
  id: ID;
  role: FileNoteStageRole;
  actorName: string;
  actorTitle: string;
  remarks: string;
  timestamp: string;
}

export interface FileNote {
  systemId: string;
  initiatedOn: string;
  subject: string;
  routing: FileNoteRoutingStage[];
  policyClausesCited: string[];
  status: "Draft" | "Approved" | "Rejected";
  generatedAt: string;
}

export interface LetterOfIntent {
  text: string;
  issuedAt: string;
}

export type MilestoneKey =
  | "MapSubmission"
  | "DrawingAndDMLetter"
  | "PESOApplication"
  | "PESOReceipt"
  | "DeptForwarding"
  | "NOCReceived";

export type MilestoneStatus = "Pending" | "InProgress" | "Done" | "Stuck";

export interface Milestone {
  key: MilestoneKey;
  label: string;
  status: MilestoneStatus;
  date?: string;
  notes?: string;
  /** For DeptForwarding — which departments it was routed to. */
  departments?: string[];
}

export interface CustomerMasterSync {
  syncedToMDM: boolean;
  syncedToSAP: boolean;
  customerCode?: string;
  syncedAt?: string;
}

export interface BudgetApproval {
  costEstimate: number;
  irr: number;
  noteText: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected";
  approvedAt?: string;
}

export interface GanttTask {
  id: ID;
  name: string;
  startDate: string;
  endDate: string;
  status: "NotStarted" | "InProgress" | "Done" | "Delayed";
  dependency?: ID;
}

export interface ProjectExecution {
  ganttTasks: GanttTask[];
  estimatedCommissionDate: string;
}

export interface WeeklyPerformanceCheck {
  weekOf: string;
  committedKL: number;
  actualKL: number;
  onTrack: boolean;
  emailSent: boolean;
}

export interface CanopyRequest {
  id: ID;
  requestedAt: string;
  committedVolumeKL: number;
  costEstimate: number;
  irr: number;
  dealerJustification: string;
  soDecision?: {
    decision: "Approved" | "Rejected";
    justification: string;
    decidedBy: string;
    decidedAt: string;
  };
  /** Real HPCL-style routing-chain file note, generated the moment the SO decides on the request. */
  fileNote?: FileNote;
  budgetNoteText?: string;
  eamStatus?: "Pending" | "Approved" | "Rejected";
  projectTimeline?: GanttTask[];
  weeklyPerformance: WeeklyPerformanceCheck[];
}

export interface ActivityEntry {
  id: ID;
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

/**
 * "NewSiteDevelopment" is the classic stretch -> LOI -> commissioning pipeline.
 * "Resitement" relocates an already-commissioned outlet (expired/disputed
 * lease, road realignment, etc. per the real Resitement Policy) — it reuses
 * the same stage pipeline but carries the extra distress/committee trail.
 */
export type CaseType = "NewSiteDevelopment" | "Resitement";

export interface ResitementDetails {
  existingOutletId: ID;
  existingOutletName: string;
  groundsSelected: string[]; // e.g. "(f) No valid lease / no tenancy protection available"
  dealerRequestText: string;
  dealerRequestDate: string;
  legalOpinionText?: string;
  technicalEvaluationCommittee: { name: string; designation: string }[];
  technicalEvaluationReportText?: string;
  technicalEvaluationDate?: string;
}

export interface LeaseAgreement {
  text: string;
  generatedAt: string;
  lessorName: string;
  landDetails: string;
  leaseTermYears: number;
  monthlyRent: number;
}

export interface DealershipAgreement {
  text: string;
  generatedAt: string;
  dealerName: string;
  tenureYears: number;
}

export interface DealerCase {
  id: ID;
  caseType: CaseType;
  salesArea: string;
  stretchName: string;
  kmlFileName?: string;
  competitorContext: string;
  stage: DealerCaseStage;
  createdAt: string;
  outletId?: ID; // set once the case produces/links to an Outlet
  resitement?: ResitementDetails;

  feasibilityReport?: {
    text: string;
    feasible: boolean;
    generatedAt: string;
  };
  roster: RosterEntry[];
  application?: ApplicationForm;
  /**
   * Persisted record of an uploaded Application Form and its best-effort text extraction —
   * kept on the case (not just the browser) so an FVC officer/auditor can later see what the
   * intake was based on. No OCR service is reachable from this environment, so this only works
   * on text-extractable uploads; see `formExtraction.ts`.
   */
  applicationFormUpload?: {
    fileName: string;
    extractedFieldsCount: number;
    warnings: string[];
    uploadedAt: string;
  };
  inspections: {
    asc?: AscResult;
    lec?: LecResult;
    fvc?: FvcResult;
  };
  fileNote?: FileNote;
  loi?: LetterOfIntent;
  milestones: Milestone[];
  customerMaster?: CustomerMasterSync;
  budget?: BudgetApproval;
  project?: ProjectExecution;
  leaseAgreement?: LeaseAgreement;
  dealershipAgreement?: DealershipAgreement;
  activityLog: ActivityEntry[];
}

// ---------------------------------------------------------------------------
// Module 3 — Predictive Analysis
// ---------------------------------------------------------------------------

export interface SalesRecord {
  outletId: ID;
  date: string;
  msKL: number;
  hsdKL: number;
  /** Always surfaced to the UI as "CRIS" regardless of how it was actually loaded. */
  source: "CRIS";
}

/** Real per-product tank stock/ullage snapshot, as reported by the live SAP "Stock Ullage" feed. */
export interface TankStock {
  outletId: ID;
  product: string; // e.g. "MS" | "HSD" | "POWER 95" — real SAP product codes as reported
  stockDate: string;
  capacityLtr: number;
  stockQtyLtr: number;
  pumpableStockLtr: number;
  ullageLtr: number;
  source: "CRIS";
}

export interface AnalyticsQuery {
  question: string;
}

export interface AnalyticsAnswer {
  question: string;
  answer: string;
  matchedOutletIds: ID[];
}

// ---------------------------------------------------------------------------
// Module 4 — Teams Communication
// ---------------------------------------------------------------------------

/**
 * Includes the Module 7 stakeholder roles (Manager Engineering, MIS Officer, Finance Officer,
 * Depot/Terminal Officer) so a forwarded dealer request can be assigned to a real TeamMember and
 * show up in Teams Communication / SO Cockpit like any other task, not just a thread note.
 */
export type TeamRole = "SO" | "RO" | "RetailHead" | "Dealer" | StakeholderRole;

export interface TeamMember {
  id: ID;
  name: string;
  role: TeamRole;
  salesArea: string;
}

export type TaskStatus = "Open" | "InProgress" | "Done" | "Overdue";
export type TaskPriority = "High" | "Medium" | "Low";

export interface TaskItem {
  id: ID;
  title: string;
  description: string;
  assignedTo: ID; // TeamMember id
  assignedBy: ID; // TeamMember id
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  urgent: boolean;
  important: boolean;
  linkedModule?: "Outlet" | "DealerCase" | "Analytics" | "Knowledge" | "DealerRequest";
  linkedRecordId?: ID;
  createdAt: string;
}

export interface KPIRecord {
  id: ID;
  memberId: ID;
  metric: string;
  target: number;
  achieved: number;
  period: string;
}

export interface MemoryNote {
  id: ID;
  author: string;
  date: string;
  text: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Module 5 — SO Cockpit
// ---------------------------------------------------------------------------

export type CalendarEventType = "LEC" | "FVC" | "ASC" | "Meeting" | "Deadline" | "Forecast" | "MNL" | "NOC-Followup";

export interface CalendarEvent {
  id: ID;
  date: string;
  type: CalendarEventType;
  title: string;
  salesArea: string;
  town: string;
  linkedCaseId?: ID;
}

export type CockpitQuadrant = "DoFirst" | "Schedule" | "Delegate" | "Eliminate";

// ---------------------------------------------------------------------------
// Module 6 — Knowledge Centre
// ---------------------------------------------------------------------------

export interface PolicyClause {
  id: ID;
  documentTitle: string;
  clauseNumber: string;
  heading: string;
  text: string;
  tags: string[];
}

export interface PolicyAnswer {
  question: string;
  matchedClauses: PolicyClause[];
  answer: string;
}

// ---------------------------------------------------------------------------
// Module 7 — Dealer Request Desk (dealer <-> SO official communication channel)
// ---------------------------------------------------------------------------

/**
 * Real recurring dealer-side issue categories: ROMMS (the dealer complaint/
 * ticketing portal), ITPS (in-tank probe/ATG system feeding stock into SAP),
 * SMS (price-change/DU alert delivery to the dealer's registered mobile),
 * Market Intelligence (competitor pricing/activity submitted by the dealer,
 * not a fault — informational, routed to the RO).
 */
export type DealerRequestCategory = "ROMMS" | "ITPS" | "SMS" | "MarketIntelligence" | "Other";

export type RequestCriticality = "Critical" | "High" | "Medium" | "Low";

/**
 * Manual priority the Sales Officer assigns when creating (or later reviewing) a request —
 * distinct from `criticality` above, which is always the explainable rule-engine's own
 * assessment and is never overwritten by this field.
 */
export type SoPriority = "HighlyCritical" | "Critical" | "HighImportance" | "MediumImportance" | "LowImportance";

/** Stakeholders an SO can forward a dealer request to for action, beyond their own resolution. */
export type StakeholderRole = "ManagerEngineering" | "MISOfficer" | "FinanceOfficer" | "DepotTerminalOfficer";

export interface ForwardingEntry {
  id: ID;
  stakeholders: StakeholderRole[];
  note?: string;
  forwardedBy: string;
  forwardedAt: string;
  /** Real TaskItem(s) created for the forwarded stakeholder(s) — surfaces in Teams/Cockpit, not just this thread. */
  taskIds: ID[];
}

export type DealerRequestStatus = "Open" | "InProgress" | "Resolved" | "Escalated";

export interface DealerRequestMessage {
  id: ID;
  from: "Dealer" | "SO" | "AI" | "System";
  authorName: string;
  text: string;
  timestamp: string;
}

export interface DealerRequest {
  id: ID;
  outletId: ID;
  dealerName: string;
  category: DealerRequestCategory;
  subject: string;
  description: string;
  /** Real external ticket/complaint reference, e.g. a ROMMS complaint number, if the dealer has one. */
  externalReferenceNo?: string;
  /** Date the dealer says the issue was first raised (in ROMMS/with the ITPS vendor/etc) — drives SLA-based criticality. */
  externalRaisedDate?: string;
  criticality: RequestCriticality;
  /** Explainable rule breakdown (+ AI note) for why this criticality was assigned — never a black-box score. */
  criticalityReason: string;
  /** SO-assigned manual priority (set at creation or updated later) — separate from `criticality` above. */
  soPriority?: SoPriority;
  /** Knowledge Centre clauses matched against category/subject/description, same pattern as file notes. */
  citedPolicyClauses: string[];
  status: DealerRequestStatus;
  raisedAt: string;
  assignedTo?: ID; // TeamMember id (SO)
  /** AI-suggested first-line triage/troubleshooting note, generated the moment the request is raised. */
  aiTriageNote: string;
  thread: DealerRequestMessage[];
  /** SO forwarding history — one or more stakeholders per forward, oldest first. */
  forwarding: ForwardingEntry[];
  resolvedAt?: string;
  resolutionSummary?: string;
  linkedTaskId?: ID; // the SO Cockpit / Teams task auto-created for this request
}
