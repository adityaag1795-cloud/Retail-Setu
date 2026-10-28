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
  /**
   * TradingAreaSnapshot.id of the trading-area cluster this outlet competes within — a group of
   * HPCL + competitor OMC outlets sharing the same catchment, per HPCL's own Market Share report.
   * Distinct from `taAverageKL` above (this outlet's own monthly trading-area potential
   * benchmark). Real data exists for a handful of outlets so far — see `seedTradingAreas` in
   * data/seed.ts — and is left blank elsewhere rather than guessed.
   */
  tradingAreaId?: ID;
  /**
   * Modernisation-request sub-workflow (Canopy/Driveway/DU/Tank/Electric Panel) — available to
   * any operational outlet, not only ones this system commissioned. Initiated by the dealer via
   * Module 7's Dealer Request Desk; each entry then sits "for recommendation" here until the SO
   * adds a justification, verifies/edits the cost estimate and IRR, and decides.
   */
  modernisationRequests: ModernisationRequest[];
  /**
   * Real month-wise LY (last FY, Apr-Mar) vs CY (current FY-to-date) volumes per product, from
   * HPCL's own DSR workbook (LY/CY MS, HSD, LUBE sheets; LY POWER; DEF). Feeds both the outlet
   * page's product comparison table and the Module 4 KPI tracker (LY month = that month's
   * target). Real data exists for outlets present in the DSR — left undefined elsewhere rather
   * than guessed. See data/productComparisonData.ts.
   */
  productComparison?: OutletProductComparison;
  /**
   * Set true to curate the prototype down to a small demo set — hidden outlets are excluded from
   * every listing surface (repository, KPI tracker, analytics, trading area cards) but remain
   * directly reachable by ID (e.g. a Module 2 case link) so nothing 404s. See seed.ts.
   */
  hiddenInPrototype?: boolean;
}

/** One month's real volume for a product — KL for MS/HSD/LUBE/DEF, units for POWER. */
export interface MonthlyFigure {
  month: string; // "YYYY-MM"
  value: number;
}

export interface ProductMonthlySeries {
  ly: MonthlyFigure[]; // last FY, Apr-Mar, used as the KPI tracker's target baseline
  cy: MonthlyFigure[]; // current FY to date, the "achieved" figure
}

export interface OutletProductComparison {
  ms: ProductMonthlySeries;
  hsd: ProductMonthlySeries;
  lube: ProductMonthlySeries;
  power: ProductMonthlySeries;
  def: ProductMonthlySeries;
}

/**
 * Real dealer-wise competitive Market Share report for one named trading area (HPCL's own
 * Network Planning "For the Month" export) — MS/HSD/Total-Market-Fuel volume and market share
 * for every OMC's outlet sharing that catchment, not just HPCL's own.
 */
export interface TradingAreaDealerFigures {
  dealerName: string;
  omc: string; // as reported: "HPCL" | "BPCL" | "IOCL" etc.
  outletId?: ID; // matched to one of our own outlets, where it is one
  /**
   * Some dealers genuinely have no figures in the source report for the snapshot month (a handful
   * report nothing all year) — left undefined rather than shown as a fabricated 0.
   */
  msVolumeKL?: number; // latest FY, monthly
  hsdVolumeKL?: number;
  tmfVolumeKL?: number; // Total Market Fuel (MS+HSD)
  msMarketSharePct?: number;
  hsdMarketSharePct?: number;
  tmfMarketSharePct?: number;
}

export interface TradingAreaSnapshot {
  id: ID;
  name: string;
  month: string;
  dealers: TradingAreaDealerFigures[];
}

export type ActionPointStatus = "Open" | "InProgress" | "Done";

/** SO's own action points / minutes-of-meeting memory against an outlet — for follow-up, not just a log. */
export interface ActionPoint {
  id: ID;
  outletId: ID;
  date: string;
  raisedBy: string;
  title: string;
  notes: string;
  actionRequired?: string;
  owner?: string;
  dueDate?: string;
  status: ActionPointStatus;
  createdAt: string;
  /** Set the moment status transitions to "Done" — feeds the Cockpit's completed-work calendar. */
  completedAt?: string;
}

/** A real crude-oil quote fetched live from a public source, or an explicit failure — never a fabricated number. */
export type CrudeRateResult =
  | { ok: true; symbol: string; priceUsd: number; asOf: string; source: string }
  | { ok: false; error: string };

/** A batch of real headlines fetched live from a public news source, or an explicit failure — used for both the SO Cockpit's energy-sector feed and the per-outlet district news feed. */
export type NewsFeedResult = { ok: true; headlines: { title: string; link: string }[]; source: string } | { ok: false; error: string };

/** SO's manual fallback entry for the day's crude rate / energy news, used when the live fetch fails or is unavailable. */
export interface EnergyManualEntry {
  id: ID;
  date: string; // "YYYY-MM-DD"
  crudeRateUsdPerBbl?: number;
  notes: string; // free-form real headlines/summary the SO pasted in
  postedAt: string;
}

/**
 * A free-form "keep feeding me data" input against an outlet — the SO pastes whatever update
 * they have (one fact per line) rather than waiting for a code change. Lines matching a known
 * Outlet field (Status:, Dealer Name:, Canopy:, Nozzle Sales Started:, TA Average KL:) are
 * applied directly; any other "Key: Value" line is merged into the outlet's free-form Master
 * Sheet; anything that isn't a recognisable Key: Value line is kept verbatim as a note rather
 * than dropped or guessed at — see services/outletInput.ts.
 */
export interface OutletDataNote {
  id: ID;
  outletId: ID;
  submittedAt: string;
  rawText: string;
  structuredFieldUpdates: { field: string; oldValue: string; newValue: string }[];
  masterSheetUpdates: { key: string; oldValue?: string; newValue: string }[];
  freeTextNotes: string[];
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
  /**
   * Real file the SO attached when logging this communication (PDF/DOCX/TXT/MD) — same best-effort
   * raw-text extraction as the ASC/LEC/FVC inspection uploads (formExtraction.ts), kept as a text
   * preview only, not the raw bytes. Optional — a communication logged without an attachment has
   * neither field.
   */
  uploadedFileName?: string;
  uploadedTextPreview?: string;
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
 * A person who has expressed interest in a stretch before (or instead of) a formal Application
 * Form intake — captured early during Stretch Identification so the SO has a record of who's
 * interested, on what land, and how to reach them, ahead of the roster/feasibility stage.
 */
export interface InterestedApplicant {
  id: ID;
  name: string;
  stretchName: string;
  landDetails: string;
  category: string;
  mobileNo: string;
  addedAt: string;
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

/** Many Annexure V items only apply to certain applicant types (Group/Partnership/Non-Individual/Category) — N.A. is a real, distinct answer from No. */
export type AscAnswer = "Yes" | "No" | "N.A." | "";

/** Annexure V eligibility checklist (19 objective items + free-text deficiencies + recommendation). */
export interface AscChecklistItem {
  id: string; // Annexure V S.No, e.g. "1".."19"
  particular: string;
  applicability: string;
  answer: AscAnswer;
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
  spouseName?: string;
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
  /** Real Annexure V header fields — an ASC report is filed against a specific numbered site under a named Regional Office. */
  regionalOfficeName: string;
  locationSrNo: string;
  member1: string;
  member2: string;
  /** Real Annexure V has two more sign-offs beyond the two committee members: the scrutinizing officer, and the final Officer In-Charge (e.g. GM Retail) who endorses the recommendation. */
  reviewingOfficerName: string;
  reviewingOfficerDesignation: string;
  officerInChargeName: string;
  officerInChargeDesignation: string;
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

/**
 * Record of a scanned/offline ASC, LEC or FVC report attached to the case for audit purposes —
 * same best-effort raw-text extraction as the Application Form upload (formExtraction.ts), but
 * without field-specific mapping: these three reports have no single fixed layout to pattern-match
 * against, so the file is kept as a reference document rather than auto-filling the checklist.
 */
export interface InspectionUploadRecord {
  fileName: string;
  uploadedAt: string;
  textPreview: string;
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

/** One row of the real LOI file note's activity table (HPCL Advocate Opinion / LEC / FVC / document checks). */
export interface LoiActivityRow {
  activity: string;
  date: string;
  team: string;
  result: string;
  attachment: string; // e.g. "Annexure-7"
}

/**
 * Structured input for the real "File Note for LOI" — matches a real sample file note
 * (advertisement + location details, the case's own selection narrative, ASC confirmation,
 * an activity table, land/site/FVC verification paragraphs, and an approval ask), rendered
 * verbatim to that format by services/loiFileNote.ts rather than summarised by an AI engine.
 */
export interface LoiFileNoteForm {
  regionalOfficeName: string;
  advertisedLocationDescription: string;
  locationSerialNo: string;
  advertisementDate: string;
  newspapers: string;
  lastDateToApply: string;

  category: string;
  typeOfRO: string;
  classOfMarket: string;
  typeOfSite: string;
  plotSizeM: string;
  district: string;
  modeOfSelection: string;
  noOfResponse: string;

  selectionNarrative: string;

  ascCommitteeSize: number;
  ascDate: string;
  ascAnnexureRef: string;

  activities: LoiActivityRow[];

  selectedApplicantName: string;
  advocateReportDate: string;
  landParcelDescription: string;
  jamabandiYear: string;
  village: string;
  tehsil: string;
  verifiedAreaSqM: string;
  fvcDate: string;
  landDocumentsAnnexureRef: string;
  dealerPortalAnnexureRef: string;

  annexureList: string[];
}

export type MilestoneKey =
  | "OfferLetter"
  | "MapSubmission"
  | "DrawingAndDMLetter"
  | "PESOApplication"
  | "PESOReceipt"
  | "DeptForwarding"
  | "NOCReceived";

export type MilestoneStatus = "Pending" | "InProgress" | "Done" | "Stuck";

export interface Milestone {
  /** One of the fixed MilestoneKey values, or a generated id for an SO-added custom milestone (see `custom`). */
  key: MilestoneKey | string;
  label: string;
  status: MilestoneStatus;
  date?: string;
  notes?: string;
  /** For DeptForwarding — which departments it was routed to. */
  departments?: string[];
  /** True for a milestone the SO added by hand (e.g. a specific department's NOC) rather than one of the fixed six. */
  custom?: boolean;
}

export interface CustomerMasterSync {
  syncedToMDM: boolean;
  syncedToSAP: boolean;
  customerCode?: string;
  syncedAt?: string;
}

/**
 * Budget approval for a New Retail Outlet — same real cost-estimate + IRR engine used for
 * modernisation requests (services/modernisation.ts): a combined line-item cost estimate across
 * every real rate-card category (Civil Works, Driveway, DU, Tank, Electric Panel — a new site
 * needs all of them, unlike a single modernisation ask), and IRR computed from the volume the SO
 * envisages the new outlet will do, not entered as raw numbers.
 */
export interface BudgetApproval {
  costEstimate: CostEstimate;
  irr?: IrrResult;
  noteText?: string;
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

/** The 5 modernisation types a dealer can request against an operational outlet. */
export type ModernisationType = "Canopy" | "Driveway" | "DU" | "Tank" | "ElectricPanel";

/** WDV depreciation bucket a cost-estimate line item falls into, per the real IRR sheet's own split. */
export type DepreciationBucket = "Civil" | "PlantMachinery";

export interface CostEstimateLineItem {
  id: ID;
  description: string;
  depreciationBucket: DepreciationBucket;
  qty: number;
  uom: string;
  /** Rs per unit — HPCL's real standard rate for this item, editable by the SO if local rates differ. */
  rate: number;
  /** qty * rate, recomputed server-side whenever the line item changes. */
  amount: number;
}

export interface CostEstimate {
  lineItems: CostEstimateLineItem[];
  /** GST rate applicable on the capex (e.g. 0.18) and the real state-wise non-creditable fraction
   *  (Haryana FY23-24: 89.33% of HPCL's turnover is non-GST fuel, so that fraction of input GST on
   *  capex is not creditable and becomes a real addback to investment cost). */
  gstRatePct: number;
  gstNonCreditablePct: number;
  subtotal: number;
  gstAddback: number;
  totalInvestment: number;
  civilAmount: number;
  plantMachineryAmount: number;
}

export interface IrrAssumptions {
  /** Incremental MS+HSD volume (KL/month) this investment is expected to unlock. */
  incrementalVolumeKLPerMonth: number;
  horizonYears: number;
  /** Per the real HQO circular (24-May-2024, current year): Gross Margin Rs 975/KL. */
  grossMarginRsPerKL: number;
  /** Per the same circular: Operating Cost Rs 246/KL. */
  operatingCostRsPerKL: number;
  civilDepreciationRatePct: number;
  pmDepreciationRatePct: number;
  corporateTaxRatePct: number;
  salvagePctOfPM: number;
}

export interface IrrYearRow {
  year: number;
  netIncome: number;
  depreciation: number;
  profitBeforeTax: number;
  taxPaid: number;
  cashFlow: number;
}

export interface IrrResult {
  assumptions: IrrAssumptions;
  yearlyCashFlow: IrrYearRow[];
  irrPct: number | null;
  /** Real HQO circular minimum: 15%, irrespective of investment amount. */
  minimumHurdlePct: number;
  meetsHurdle: boolean;
  computedAt: string;
}

export interface ModernisationRequest {
  id: ID;
  modernisationType: ModernisationType;
  requestedAt: string;
  /** Set when this request was raised via Module 7 (Dealer Request Desk) rather than directly here. */
  dealerRequestId?: ID;
  dealerJustification: string;
  /** Added by the SO in Module 1 while the request sits "for recommendation". */
  soJustification?: string;
  costEstimate: CostEstimate;
  irr?: IrrResult;
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

// ---------------------------------------------------------------------------
// Feasibility Report — structured, matches HPCL's real "Report on Feasibility:
// Proposed Retail Outlet" form (section numbers/labels below mirror that form
// exactly) rather than a free-text AI summary. See services/feasibilityReport.ts.
// ---------------------------------------------------------------------------

export type MarketClass = "A" | "B" | "C" | "D1(NH)" | "D2(SH)" | "E";
export type TrafficLevel = "High" | "Medium" | "Low";
export type CarriagewayType = "Divided carriageway" | "Undivided carriageway";

/** One row of the "Trading Area Potential" table — MS & HSD sales from T.A. ROs for last 12 months. */
export interface TradingAreaPotentialRow {
  roName: string;
  distanceFromProposedKm?: number;
  oilCo: string; // as on the real form: "HPC" | "IOC" | "BPC" | "Pvt." etc.
  msKLPM: number;
  hsdKLPM: number;
}

export interface FeasibilityReportForm {
  locationName: string;
  district: string;
  state: string;
  classOfMarket: MarketClass;
  existingTradingAreaOrMonopoly: "Existing" | "Monopoly" | "New";
  lsaOrRemoteArea: string;
  tradingAreaPotential: TradingAreaPotentialRow[];
  trafficLevel: TrafficLevel;
  expectedTrafficGrowthPct: number;
  reasonForTrafficGrowth: string;
  presentTAGrowthMsKLPM: number;
  presentTAGrowthHsdKLPM: number;
  expectedTAGrowthMsPct: number;
  expectedTAGrowthHsdPct: number;
  expectedTAPotentialMsKLPM: number;
  expectedTAPotentialHsdKLPM: number;
  meetsVolumeNorms: YesNo;
  reasonForAnticipatedGrowth: string;
  estimatedSalesYear1Ms: number;
  estimatedSalesYear1Hsd: number;
  estimatedSalesYear2Ms: number;
  estimatedSalesYear2Hsd: number;
  estimatedSalesYear3Ms: number;
  estimatedSalesYear3Hsd: number;
  marketIntelligence: string;
  generalInformation: string;
  feasibleAsPerVolumeNorms: YesNo;
  mayBeIncludedInSrmp: YesNo;
  regularOrRural: "Regular" | "Rural" | "";
  roadNo: string;
  stretchBoundary: string;
  kmStoneFrom: string;
  kmStoneTo: string;
  distanceFromLandmark: string;
  boundaryIdentification: string;
  otherInfo: string;
  carriagewayType: CarriagewayType;
  nearbyRODistanceNote: string;
  preparedBy: string;
  designation: string;
  reportDate: string;
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
  interestedApplicants: InterestedApplicant[];

  feasibilityReportForm?: FeasibilityReportForm;
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
  /** Scanned/offline ASC, LEC or FVC reports attached for the record — see InspectionUploadRecord. */
  inspectionUploads?: {
    asc?: InspectionUploadRecord;
    lec?: InspectionUploadRecord;
    fvc?: InspectionUploadRecord;
  };
  loiFileNoteForm?: LoiFileNoteForm;
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

/**
 * Real per-outlet dry-risk/cover status from HPCL's own "Outlet Criticality Monitor" workbook —
 * whether the outlet is (or is about to go, intraday) dry in MS/HSD, and whether an indent has
 * actually been placed and funds are available to cover it. Real data exists only for the outlets
 * present in that workbook; left absent elsewhere rather than guessed.
 */
/**
 * Real day-wise ITPS (online) transaction counts per outlet, from HPCL's own "Online Transactions"
 * report — total plus per-terminal breakdown. Real data exists only for the outlets and days
 * present in that report; left absent elsewhere rather than guessed.
 */
export interface ItpsTransactionDay {
  outletId: ID;
  date: string; // "YYYY-MM-DD"
  total: number;
  terminals: number[];
}

export interface OutletCriticalityMonitor {
  outletId: ID;
  dryMS: boolean;
  dryMSIntraday: boolean;
  dryHSD: boolean;
  dryHSDIntraday: boolean;
  indentPlaced: boolean;
  fundsAvailable: boolean;
  criticality: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Vehicle-type classification, by transaction amount, per the real DU/RELCON automation feed —
 * SO's own real thresholds: <Rs 500 Two-Wheeler, Rs 500-10,000 Four-Wheeler, Rs 10,000-100,000
 * HMV (heavy motor vehicle), >Rs 100,000 Bowser supply.
 */
export type VehicleType = "TwoWheeler" | "FourWheeler" | "HMV" | "BowserSupply";

export interface VehicleTypeCount {
  transactions: number;
  volumeKL: number;
  amountRs: number;
}

/** Day-wise real traffic pattern at one outlet, derived from its DU transaction log. */
export interface DailyTrafficSummary {
  outletId: ID;
  date: string;
  byVehicleType: Record<VehicleType, VehicleTypeCount>;
  byProduct: Record<string, VehicleTypeCount>;
  /** Transaction count per hour of day, index 0-23 — drives peak-hour analysis. */
  hourlyTransactionCounts: number[];
  /**
   * Transaction count per hour of day (0-23), per product — drives the outlet page's hourly
   * sales-trend chart. Optional: only present for days whose source transaction rows are still
   * available to recompute this from (see trafficData.ts's header comment for the real gap).
   */
  hourlyByProduct?: Record<string, number[]>;
}

/**
 * One calendar month's real transaction-amount "slab" (vehicle-type) breakdown for an outlet —
 * month totals plus a per-day average so a partial month (the current, still-in-progress one)
 * isn't misread as a full month's volume. Feeds the slab-wise volume trend table and its
 * rule-based insight (services/trafficAnalytics.ts) — no AI narrative, just the real deltas.
 */
export interface SlabMonthlyRow {
  month: string; // "YYYY-MM"
  daysOnFile: number;
  totals: Record<VehicleType, VehicleTypeCount>;
  avgPerDay: Record<VehicleType, VehicleTypeCount>;
}

/** Per-nozzle (DU) activity — lets the SO see if every dispensing unit is actually operating. */
export interface NozzleActivity {
  outletId: ID;
  pumpNo: string;
  nozzleNo: string;
  transactionCount: number;
  firstTransactionAt: string;
  lastTransactionAt: string;
  /** True if this nozzle has gone quiet for several days while others at the same outlet keep transacting. */
  possiblyInactive: boolean;
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
  /** External portal to redirect to when the task title is clicked (e.g. the CRM/forecast system the task is about) — takes priority over linkedModule. */
  externalUrl?: string;
  createdAt: string;
  /** Set the moment status transitions to "Done" — the record of what was done, and when, for the Cockpit's completed-work calendar. */
  completedAt?: string;
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
 * not a fault — informational, routed to the RO). Modernisation is the dealer's
 * entry point for a Canopy/Driveway/DU/Tank/Electric Panel ask — raising one here
 * creates the linked ModernisationRequest on the outlet, which then sits "for
 * recommendation" in Module 1 for the SO's justification, cost-estimate and IRR review.
 */
export type DealerRequestCategory = "ROMMS" | "ITPS" | "SMS" | "MarketIntelligence" | "Modernisation" | "Load" | "Other";

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
  /** Required when category is "Modernisation". */
  modernisationType?: ModernisationType;
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
  /** Set when category is "Modernisation" — the ModernisationRequest this raised on the outlet. */
  linkedModernisationRequestId?: ID;
}
