/**
 * Module 1 — Modernisation Request sub-workflow (Canopy / Driveway / DU / Tank / Electric Panel).
 *
 * Initiated by the dealer via Module 7 (Dealer Request Desk); each request then sits "for
 * recommendation" on the outlet here until the SO adds a justification and verifies/edits the
 * cost estimate and IRR before deciding.
 *
 * Every rate and formula below is sourced from real HPCL documents supplied for this prototype,
 * not invented:
 *   - Real per-item unit rates: "Cost Estimates — NRO" workbook (Civil Works / Driveway /
 *     Plant & Machinery sections).
 *   - Real Civil vs Plant & Machinery classification: the same workbook's own guideline notes
 *     (Civil Structure includes "Canopy (including lighting)"; Plant & Machinery explicitly
 *     lists "Control panel/Cabling", "Yard lighting", "Earth pits", "Tanks", "Automation" etc).
 *   - Real IRR methodology: "Format IRR Investment Proposal" workbook — WDV depreciation (Civil &
 *     Roads 10%, Plant & Machinery 15%), half-year depreciation convention in the commissioning
 *     year ("Investment has been made in the second half of the Financial year"), salvage value
 *     at 10% of P&M's original cost released in the final year, corporate tax (25.168%, incl.
 *     surcharge & cess) applied only to positive profit before tax.
 *   - Real current-year rates: HQO circular "Evaluation of Investment Proposals of New Retail
 *     Outlets" (24-May-2024) — Gross Margin Rs 975/KL, Operating Cost Rs 246/KL, minimum
 *     acceptable IRR 15% irrespective of investment amount.
 *   - Real GST-on-capex treatment: "Eligible GST 2023-24" workbook — Haryana's own FY23-24 ratio
 *     (89.33% of HPCL's Haryana turnover is non-GST fuel), so that fraction of input GST paid on
 *     capex is not creditable and is added back to the investment base.
 */
import type {
  ModernisationType,
  ModernisationRequest,
  CostEstimate,
  CostEstimateLineItem,
  DepreciationBucket,
  IrrAssumptions,
  IrrResult,
  IrrYearRow,
  Outlet,
} from "../types.js";
import { store, nextId } from "../store.js";
import { getAiEngine } from "./aiEngine.js";
import { matchClauses } from "./policyBot.js";

export class ModernisationError extends Error {}

// ---------------------------------------------------------------------------
// Real circular / sheet constants
// ---------------------------------------------------------------------------

export const GROSS_MARGIN_RS_PER_KL = 975; // HQO circular, 24-May-2024 (2024-25 rates)
export const OPERATING_COST_RS_PER_KL = 246; // same circular
export const MINIMUM_IRR_HURDLE_PCT = 15; // same circular — applies irrespective of investment size
export const CIVIL_DEPRECIATION_RATE_PCT = 10; // WDV, "Civil & Roads" bucket, per IRR sheet's OUTPUT tab
export const PM_DEPRECIATION_RATE_PCT = 15; // WDV, "Plant & Machinery" bucket
export const SALVAGE_PCT_OF_PM = 10; // released as cash inflow in the final projection year
export const CORPORATE_TAX_RATE_PCT = 25.168; // incl. surcharge & cess, per IRR sheet's OUTPUT tab
export const DEFAULT_GST_RATE_PCT = 18; // typical GST rate on construction/plant items
export const HARYANA_GST_NON_CREDITABLE_PCT = 89.33; // real FY23-24 ratio for Haryana (Eligible GST workbook)
export const DEFAULT_HORIZON_YEARS = 10;

interface RateCardItem {
  description: string;
  depreciationBucket: DepreciationBucket;
  uom: string;
  rate: number;
  defaultQty: number;
}

// Real per-item rates from the "Cost Estimates — NRO" workbook's blank-template tab (Sheet1),
// grouped by which modernisation type they serve. Bucket assignment follows that workbook's own
// guideline notes (see file header comment).
const RATE_CARDS: Record<ModernisationType, RateCardItem[]> = {
  Canopy: [
    { description: "Canopy Foundation", depreciationBucket: "Civil", uom: "EA", rate: 46000, defaultQty: 6 },
    { description: "Prefab Canopy with LED", depreciationBucket: "Civil", uom: "SQM", rate: 6500, defaultQty: 300 },
    { description: "RVI (signage / facia branding)", depreciationBucket: "PlantMachinery", uom: "SQM", rate: 2600, defaultQty: 300 },
    { description: "Yard lights with LED", depreciationBucket: "PlantMachinery", uom: "Nos", rate: 25000, defaultQty: 6 },
  ],
  Driveway: [
    { description: "WBM Layer 1", depreciationBucket: "Civil", uom: "SQM", rate: 200, defaultQty: 350 },
    { description: "WBM Layer 2", depreciationBucket: "Civil", uom: "SQM", rate: 190, defaultQty: 350 },
    { description: "WBM Layer 3", depreciationBucket: "Civil", uom: "SQM", rate: 190, defaultQty: 350 },
    { description: "GSB - 150mm", depreciationBucket: "Civil", uom: "SQM", rate: 320, defaultQty: 350 },
    { description: "Paver", depreciationBucket: "Civil", uom: "SQM", rate: 1000, defaultQty: 350 },
    { description: "RCC with steel cost - 6\"", depreciationBucket: "Civil", uom: "SQM", rate: 7400, defaultQty: 100 },
    { description: "Kerb wall", depreciationBucket: "Civil", uom: "RMT", rate: 550, defaultQty: 150 },
  ],
  DU: [
    { description: "DU installation (civil)", depreciationBucket: "Civil", uom: "Nos", rate: 10000, defaultQty: 1 },
    { description: "Pipe lines 50NB HDPE", depreciationBucket: "Civil", uom: "RMT", rate: 2500, defaultQty: 50 },
    { description: "DU (SDD/HDD unit)", depreciationBucket: "PlantMachinery", uom: "EA", rate: 135000, defaultQty: 1 },
  ],
  Tank: [
    { description: "Tank installation, 16 KL, RCC pit (civil)", depreciationBucket: "Civil", uom: "Nos", rate: 400000, defaultQty: 1 },
    { description: "Tank installation, 22 KL, RCC pit (civil)", depreciationBucket: "Civil", uom: "Nos", rate: 450000, defaultQty: 0 },
    { description: "Tank installation, 35 KL, RCC pit (civil)", depreciationBucket: "Civil", uom: "Nos", rate: 550000, defaultQty: 0 },
    { description: "16 KL SS tank (unit)", depreciationBucket: "PlantMachinery", uom: "EA", rate: 200000, defaultQty: 1 },
    { description: "22 KL SS tank (unit)", depreciationBucket: "PlantMachinery", uom: "EA", rate: 220000, defaultQty: 0 },
    { description: "35 KL SS tank (unit)", depreciationBucket: "PlantMachinery", uom: "EA", rate: 320000, defaultQty: 0 },
  ],
  ElectricPanel: [
    { description: "PMCC Panel", depreciationBucket: "PlantMachinery", uom: "LS", rate: 100000, defaultQty: 1 },
    { description: "Cable (3C x 2.5 / 4C x 2.5 SQMM)", depreciationBucket: "PlantMachinery", uom: "RMT", rate: 160, defaultQty: 800 },
    { description: "Power Conditioner", depreciationBucket: "PlantMachinery", uom: "EA", rate: 80000, defaultQty: 1 },
    { description: "Earth pits", depreciationBucket: "PlantMachinery", uom: "Nos", rate: 8000, defaultQty: 10 },
  ],
};

export function rateCardFor(type: ModernisationType): RateCardItem[] {
  return RATE_CARDS[type];
}

export function recomputeCostEstimate(ce: CostEstimate): CostEstimate {
  for (const li of ce.lineItems) {
    li.amount = Math.round(li.qty * li.rate * 100) / 100;
  }
  const civilAmount = round2(ce.lineItems.filter((l) => l.depreciationBucket === "Civil").reduce((a, l) => a + l.amount, 0));
  const plantMachineryAmount = round2(ce.lineItems.filter((l) => l.depreciationBucket === "PlantMachinery").reduce((a, l) => a + l.amount, 0));
  const subtotal = round2(civilAmount + plantMachineryAmount);
  const gstAddback = round2(subtotal * (ce.gstRatePct / 100) * (ce.gstNonCreditablePct / 100));
  return {
    ...ce,
    civilAmount,
    plantMachineryAmount,
    subtotal,
    gstAddback,
    totalInvestment: round2(subtotal + gstAddback),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildDefaultCostEstimate(type: ModernisationType): CostEstimate {
  const lineItems: CostEstimateLineItem[] = rateCardFor(type).map((r) => ({
    id: nextId("CEL"),
    description: r.description,
    depreciationBucket: r.depreciationBucket,
    qty: r.defaultQty,
    uom: r.uom,
    rate: r.rate,
    amount: 0,
  }));
  return recomputeCostEstimate({
    lineItems,
    gstRatePct: DEFAULT_GST_RATE_PCT,
    gstNonCreditablePct: HARYANA_GST_NON_CREDITABLE_PCT,
    subtotal: 0,
    gstAddback: 0,
    totalInvestment: 0,
    civilAmount: 0,
    plantMachineryAmount: 0,
  });
}

/**
 * Combined cost estimate for a brand-new Retail Outlet's Budget Approval — unlike a single
 * modernisation request (one of Canopy/Driveway/DU/Tank/ElectricPanel), a new site build needs
 * all of these real rate-card categories together, so every one is included as a starting line
 * item for the SO to adjust to the actual site plan.
 */
export function buildDefaultNroCostEstimate(): CostEstimate {
  const types: ModernisationType[] = ["Canopy", "Driveway", "DU", "Tank", "ElectricPanel"];
  const lineItems: CostEstimateLineItem[] = types.flatMap((t) =>
    rateCardFor(t).map((r) => ({
      id: nextId("CEL"),
      description: `${r.description} (${t})`,
      depreciationBucket: r.depreciationBucket,
      qty: r.defaultQty,
      uom: r.uom,
      rate: r.rate,
      amount: 0,
    })),
  );
  return recomputeCostEstimate({
    lineItems,
    gstRatePct: DEFAULT_GST_RATE_PCT,
    gstNonCreditablePct: HARYANA_GST_NON_CREDITABLE_PCT,
    subtotal: 0,
    gstAddback: 0,
    totalInvestment: 0,
    civilAmount: 0,
    plantMachineryAmount: 0,
  });
}

export function defaultIrrAssumptions(): IrrAssumptions {
  return {
    incrementalVolumeKLPerMonth: 0,
    horizonYears: DEFAULT_HORIZON_YEARS,
    grossMarginRsPerKL: GROSS_MARGIN_RS_PER_KL,
    operatingCostRsPerKL: OPERATING_COST_RS_PER_KL,
    civilDepreciationRatePct: CIVIL_DEPRECIATION_RATE_PCT,
    pmDepreciationRatePct: PM_DEPRECIATION_RATE_PCT,
    corporateTaxRatePct: CORPORATE_TAX_RATE_PCT,
    salvagePctOfPM: SALVAGE_PCT_OF_PM,
  };
}

/**
 * Real WDV depreciation + tax + salvage cash-flow model (see file header for sourcing), then a
 * bisection solve for IRR — the rate at which the discounted cash flows net to zero. Year 0 is
 * the capex outflow; years 1..horizon apply the half-year convention in year 1 (investment
 * assumed made mid-year) exactly as the real IRR sheet does.
 */
export function computeIrr(costEstimate: CostEstimate, assumptions: IrrAssumptions): IrrResult {
  const netMarginPerKL = assumptions.grossMarginRsPerKL - assumptions.operatingCostRsPerKL;
  const annualIncome = assumptions.incrementalVolumeKLPerMonth * 12 * netMarginPerKL;
  const civilRate = assumptions.civilDepreciationRatePct / 100;
  const pmRate = assumptions.pmDepreciationRatePct / 100;
  const taxRate = assumptions.corporateTaxRatePct / 100;
  const horizon = Math.max(1, Math.round(assumptions.horizonYears));

  let civilWdv = costEstimate.civilAmount;
  let pmWdv = costEstimate.plantMachineryAmount;
  const salvage = round2(costEstimate.plantMachineryAmount * (assumptions.salvagePctOfPM / 100));

  const rows: IrrYearRow[] = [];
  const cashFlows: number[] = [-costEstimate.totalInvestment];

  for (let year = 1; year <= horizon; year++) {
    const isFirstYear = year === 1;
    const civilDep = round2(civilWdv * civilRate * (isFirstYear ? 0.5 : 1));
    const pmDep = round2(pmWdv * pmRate * (isFirstYear ? 0.5 : 1));
    civilWdv = round2(civilWdv - civilDep);
    pmWdv = round2(pmWdv - pmDep);
    const depreciation = round2(civilDep + pmDep);

    const netIncome = round2(isFirstYear ? annualIncome / 2 : annualIncome);
    const profitBeforeTax = round2(netIncome - depreciation);
    const taxPaid = profitBeforeTax > 0 ? round2(profitBeforeTax * taxRate) : 0;
    const profitAfterTax = round2(profitBeforeTax - taxPaid);
    const salvageThisYear = year === horizon ? salvage : 0;
    const cashFlow = round2(profitAfterTax + depreciation + salvageThisYear);

    rows.push({ year, netIncome, depreciation, profitBeforeTax, taxPaid, cashFlow });
    cashFlows.push(cashFlow);
  }

  const irr = solveIrr(cashFlows);
  const irrPct = irr === null ? null : round2(irr * 100);

  return {
    assumptions,
    yearlyCashFlow: rows,
    irrPct,
    minimumHurdlePct: MINIMUM_IRR_HURDLE_PCT,
    meetsHurdle: irrPct !== null && irrPct >= MINIMUM_IRR_HURDLE_PCT,
    computedAt: new Date().toISOString(),
  };
}

function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/** Bisection solve for IRR over [-0.99, 10] (-99%..1000%) — robust for the monotonic cash-flow shape here. */
function solveIrr(cashFlows: number[]): number | null {
  let lo = -0.99;
  let hi = 10;
  let npvLo = npv(lo, cashFlows);
  let npvHi = npv(hi, cashFlows);
  if (npvLo * npvHi > 0) return null; // no sign change — never profitable (or always profitable) in range
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid, cashFlows);
    if (Math.abs(npvMid) < 1e-6) return mid;
    if (npvMid * npvLo < 0) {
      hi = mid;
      npvHi = npvMid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Request lifecycle
// ---------------------------------------------------------------------------

function outletOrThrow(outletId: string): Outlet {
  const o = store.outlets.get(outletId);
  if (!o) throw new ModernisationError(`Outlet ${outletId} not found`);
  return o;
}

function findRequest(outlet: Outlet, requestId: string): ModernisationRequest {
  const req = outlet.modernisationRequests.find((r) => r.id === requestId);
  if (!req) throw new ModernisationError(`Modernisation request ${requestId} not found on ${outlet.id}`);
  return req;
}

export function createModernisationRequest(
  outletId: string,
  modernisationType: ModernisationType,
  dealerJustification: string,
  dealerRequestId?: string,
): ModernisationRequest {
  const outlet = outletOrThrow(outletId);
  if (outlet.status !== "Operational") throw new ModernisationError("Modernisation requests are only available for operational outlets");
  const req: ModernisationRequest = {
    id: nextId("MOD"),
    modernisationType,
    requestedAt: new Date().toISOString(),
    dealerRequestId,
    dealerJustification,
    costEstimate: buildDefaultCostEstimate(modernisationType),
    weeklyPerformance: [],
  };
  outlet.modernisationRequests.push(req);
  return req;
}

export function setSoJustification(outletId: string, requestId: string, soJustification: string): ModernisationRequest {
  const req = findRequest(outletOrThrow(outletId), requestId);
  req.soJustification = soJustification;
  return req;
}

export function updateCostEstimateLineItems(
  outletId: string,
  requestId: string,
  lineItems: { id: string; qty: number; rate: number }[],
): ModernisationRequest {
  const req = findRequest(outletOrThrow(outletId), requestId);
  for (const update of lineItems) {
    const li = req.costEstimate.lineItems.find((l) => l.id === update.id);
    if (li) {
      li.qty = update.qty;
      li.rate = update.rate;
    }
  }
  req.costEstimate = recomputeCostEstimate(req.costEstimate);
  if (req.irr) req.irr = computeIrr(req.costEstimate, req.irr.assumptions);
  return req;
}

export function updateIrrAssumptions(outletId: string, requestId: string, assumptions: Partial<IrrAssumptions>): ModernisationRequest {
  const req = findRequest(outletOrThrow(outletId), requestId);
  const merged: IrrAssumptions = { ...(req.irr?.assumptions ?? defaultIrrAssumptions()), ...assumptions };
  req.irr = computeIrr(req.costEstimate, merged);
  return req;
}

export async function decideModernisationRequest(
  outletId: string,
  requestId: string,
  decision: "Approved" | "Rejected",
  justification: string,
  decidedBy: string,
): Promise<ModernisationRequest> {
  const outlet = outletOrThrow(outletId);
  const req = findRequest(outlet, requestId);
  if (!req.soJustification) throw new ModernisationError("Add the SO's justification before deciding");
  if (!req.irr) throw new ModernisationError("Compute the IRR before deciding");
  req.soDecision = { decision, justification, decidedBy, decidedAt: new Date().toISOString() };
  if (decision === "Approved") {
    const policyClauses = matchClauses("modernisation budget eam corpus fund working capital retail engineering", 3);
    const fileNoteRemarks = await getAiEngine().generate("modernisationFileNote", {
      outletName: outlet.name,
      modernisationType: req.modernisationType,
      costEstimate: req.costEstimate,
      irr: req.irr,
      dealerJustification: req.dealerJustification,
      soJustification: req.soJustification,
      policyClauses,
    });
    req.fileNote = {
      systemId: nextId("SYS"),
      initiatedOn: new Date().toISOString().slice(0, 10),
      subject: `Approval for ${req.modernisationType} modernisation — ${outlet.name}`,
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
    req.budgetNoteText = await getAiEngine().generate("modernisationBudgetNote", {
      outletName: outlet.name,
      modernisationType: req.modernisationType,
      costEstimate: req.costEstimate,
      irr: req.irr,
      dealerJustification: req.dealerJustification,
      soJustification: req.soJustification,
    });
    req.eamStatus = "Pending";
  }
  return req;
}

export function decideModernisationEAM(outletId: string, requestId: string, approve: boolean): ModernisationRequest {
  const outlet = outletOrThrow(outletId);
  const req = findRequest(outlet, requestId);
  req.eamStatus = approve ? "Approved" : "Rejected";
  if (approve && req.modernisationType === "Canopy") outlet.canopy = true;
  return req;
}

/** Weekly job: compares committed vs actual incremental volume and records whether the dealer is on track. */
export function recordWeeklyModernisationPerformance(outletId: string, requestId: string, actualKL: number): ModernisationRequest {
  const outlet = outletOrThrow(outletId);
  const req = findRequest(outlet, requestId);
  const committedKL = req.irr?.assumptions.incrementalVolumeKLPerMonth ?? 0;
  req.weeklyPerformance.push({
    weekOf: new Date().toISOString().slice(0, 10),
    committedKL,
    actualKL,
    onTrack: actualKL >= committedKL * 0.9,
    emailSent: true,
  });
  return req;
}

export function pendingModernisationRequests(): { outlet: Outlet; request: ModernisationRequest }[] {
  const out: { outlet: Outlet; request: ModernisationRequest }[] = [];
  for (const outlet of store.outlets.values()) {
    for (const req of outlet.modernisationRequests) {
      if (!req.soDecision) out.push({ outlet, request: req });
    }
  }
  return out;
}
