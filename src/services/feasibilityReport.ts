import type { DealerCase, FeasibilityReportForm, TradingAreaPotentialRow } from "../types.js";
import { store } from "../store.js";

/** Real HPCL Market Share OMC labels -> the abbreviations used on the actual feasibility form. */
function omcAbbrev(omc: string): string {
  if (omc === "HPCL") return "HPC";
  if (omc === "IOCL") return "IOC";
  if (omc === "BPCL") return "BPC";
  return omc || "Pvt.";
}

/**
 * Prefills as much of the form as real data on file supports; everything else (traffic
 * assessment, market intelligence, recommendation, layout sketch) needs the SO's own
 * on-the-ground judgement and is left blank rather than guessed.
 */
export function defaultFeasibilityReportForm(c: DealerCase): FeasibilityReportForm {
  const outlet = c.outletId ? store.outlets.get(c.outletId) : undefined;
  const tradingArea = outlet?.tradingAreaId ? store.tradingAreas.get(outlet.tradingAreaId) : undefined;
  const tradingAreaPotential: TradingAreaPotentialRow[] = tradingArea
    ? tradingArea.dealers.map((d) => ({
        roName: d.dealerName,
        oilCo: omcAbbrev(d.omc),
        msKLPM: d.msVolumeKL,
        hsdKLPM: d.hsdVolumeKL,
      }))
    : [];

  return {
    locationName: outlet?.name ?? c.stretchName,
    district: outlet?.district ?? c.salesArea.replace(/\s*SA$/i, ""),
    state: "Haryana",
    classOfMarket: "B",
    existingTradingAreaOrMonopoly: tradingArea ? "Existing" : "New",
    lsaOrRemoteArea: "",
    tradingAreaPotential,
    trafficLevel: "Medium",
    expectedTrafficGrowthPct: 0,
    reasonForTrafficGrowth: "",
    presentTAGrowthMsKLPM: 0,
    presentTAGrowthHsdKLPM: 0,
    expectedTAGrowthMsPct: 0,
    expectedTAGrowthHsdPct: 0,
    expectedTAPotentialMsKLPM: tradingAreaPotential.reduce((s, r) => s + r.msKLPM, 0),
    expectedTAPotentialHsdKLPM: tradingAreaPotential.reduce((s, r) => s + r.hsdKLPM, 0),
    meetsVolumeNorms: "",
    reasonForAnticipatedGrowth: "",
    estimatedSalesYear1Ms: 0,
    estimatedSalesYear1Hsd: 0,
    estimatedSalesYear2Ms: 0,
    estimatedSalesYear2Hsd: 0,
    estimatedSalesYear3Ms: 0,
    estimatedSalesYear3Hsd: 0,
    marketIntelligence: "",
    generalInformation: "",
    feasibleAsPerVolumeNorms: "",
    mayBeIncludedInSrmp: "",
    regularOrRural: "",
    roadNo: "",
    stretchBoundary: "",
    kmStoneFrom: "",
    kmStoneTo: "",
    distanceFromLandmark: "",
    boundaryIdentification: "",
    otherInfo: "",
    carriagewayType: "Undivided carriageway",
    nearbyRODistanceNote: "",
    preparedBy: "",
    designation: c.salesArea ? `AREA SALES MANAGER – ${c.salesArea.toUpperCase()}` : "",
    reportDate: new Date().toISOString().slice(0, 10),
  };
}

function subtotalsByOilCo(rows: TradingAreaPotentialRow[]): { oilCo: string; ms: number; hsd: number }[] {
  const order: string[] = [];
  const totals = new Map<string, { ms: number; hsd: number }>();
  for (const r of rows) {
    if (!totals.has(r.oilCo)) {
      totals.set(r.oilCo, { ms: 0, hsd: 0 });
      order.push(r.oilCo);
    }
    const t = totals.get(r.oilCo)!;
    t.ms += r.msKLPM;
    t.hsd += r.hsdKLPM;
  }
  return order.map((oilCo) => ({ oilCo, ...totals.get(oilCo)! }));
}

/** Renders the exact HPCL "Report on Feasibility: Proposed Retail Outlet" format — section numbers and labels mirror the real form. */
export function renderFeasibilityReportText(form: FeasibilityReportForm): string {
  const rows = form.tradingAreaPotential;
  const subtotals = subtotalsByOilCo(rows);
  const totalMs = rows.reduce((s, r) => s + r.msKLPM, 0);
  const totalHsd = rows.reduce((s, r) => s + r.hsdKLPM, 0);

  const col = (s: string, n: number) => s.padEnd(n).slice(0, Math.max(n, s.length));
  const taHeader = `  ${col("Name Of RO", 30)} ${col("Distance (km)", 14)} ${col("Oil Co.", 8)} ${col("MS", 8)} ${col("HSD", 8)}`;
  const taRows = rows.map(
    (r) =>
      `  ${col(r.roName, 30)} ${col(r.distanceFromProposedKm != null ? String(r.distanceFromProposedKm) : "", 14)} ${col(r.oilCo, 8)} ${col(String(r.msKLPM), 8)} ${col(String(r.hsdKLPM), 8)}`,
  );
  const subtotalRows = subtotals.map(
    (s) => `  ${col("Sub Total", 30)} ${col("", 14)} ${col(s.oilCo, 8)} ${col(String(s.ms), 8)} ${col(String(s.hsd), 8)}`,
  );
  const totalRow = `  ${col("Total", 30)} ${col("", 14)} ${col("", 8)} ${col(String(totalMs), 8)} ${col(String(totalHsd), 8)}`;

  return [
    `Report on Feasibility: Proposed Retail Outlet at`,
    `Location: ${form.locationName} , Dist.: ${form.district}   State: ${form.state}`,
    ``,
    `1. Class of Market (A/B/C/D1(NH)/D2(SH)/E): ${form.classOfMarket}`,
    `2. Existing Trading Area / Monopoly: ${form.existingTradingAreaOrMonopoly}`,
    `3. LSA / Remote Area: ${form.lsaOrRemoteArea}`,
    `4. Trading Area Potential: MS & HSD sales from T.A. ROs for last 12 months.`,
    taHeader,
    ...(taRows.length ? taRows : ["  (no trading-area ROs on file — entered manually if none)"]),
    ...subtotalRows,
    totalRow,
    `Note: In case of New / Monopoly Market based on the assessment of potential.`,
    ``,
    `5. Assessment of Potential of Proposed location:`,
    `a. Traffic (High / Medium / Low): ${form.trafficLevel} | Expected % Growth in Traffic: ${form.expectedTrafficGrowthPct}% | Reason for Growth in Traffic: ${form.reasonForTrafficGrowth}`,
    `b. Present TA Growth (Sales Vol. in KLPM): MS: ${form.presentTAGrowthMsKLPM} | HSD: ${form.presentTAGrowthHsdKLPM}   Expected % Growth in TA: MS ${form.expectedTAGrowthMsPct}% | HSD ${form.expectedTAGrowthHsdPct}%   Expected T.A. Potential in KLPM: MS ${form.expectedTAPotentialMsKLPM} | HSD ${form.expectedTAPotentialHsdKLPM}   Whether proposed RO meets volume norms of the market: ${form.meetsVolumeNorms}`,
    `Reason for Anticipated Growth in Sales Vol. (MS/HSD) in the trading area: ${form.reasonForAnticipatedGrowth}`,
    `c. Estimated Sales in KL/Month from the Proposed RO:   MS | HSD`,
    `   1st Year | ${form.estimatedSalesYear1Ms} | ${form.estimatedSalesYear1Hsd}`,
    `   2nd Year | ${form.estimatedSalesYear2Ms} | ${form.estimatedSalesYear2Hsd}`,
    `   3rd Year | ${form.estimatedSalesYear3Ms} | ${form.estimatedSalesYear3Hsd}`,
    ``,
    `6. Market Intelligence if any (Proposed OMC activity, any other factor influencing Sales): ${form.marketIntelligence}`,
    ``,
    `7. General Information (Any Site identified, Whether location considered earlier, etc.): ${form.generalInformation}`,
    ``,
    `8. Recommendation: (a) Proposed RO Feasible as per Volume Norms (in 2nd year of operation) of the market (Yes/No): ${form.feasibleAsPerVolumeNorms}`,
    `   May be included in SRMP (Y/N): ${form.mayBeIncludedInSrmp}`,
    `   If Yes, Regular or Rural: ${form.regularOrRural}`,
    ``,
    `9. Enclosure: Sketch of Location with reference to NH/SH/ Road no., land mark, its stretch /boundary, Approximate distance from contiguous T.A., etc.`,
    ``,
    `Date: ${form.reportDate}                                    ${form.preparedBy}`,
    `                                                     ${form.designation}`,
    ``,
    ``,
    `LAY OUT SKETCH OF PROPOSED LOCATION`,
    `Location: ${form.locationName} , Dist.: ${form.district}   State: ${form.state}`,
    ``,
    `Road NO. (NH/SH/ Other Road No.) if any: ${form.roadNo}`,
    ``,
    `Stretch / Boundary of location: ${form.stretchBoundary}`,
    ``,
    `For NH /SH/ Other Road with KM Stone: From KM Stone ${form.kmStoneFrom || "____"} to ${form.kmStoneTo || "____"}.`,
    `In Other cases distance from some prominent land mark: ${form.distanceFromLandmark}`,
    `Identification of boundary / stretch with respect to Name of location: ${form.boundaryIdentification}`,
    `Any other information: ${form.otherInfo}`,
    `3. Divided carriageway / Un-divided carriageway: ${form.carriagewayType}`,
    ``,
    `4. Illustrative Sketch of Location on divided carriage-way`,
    `   (Mention distance of nearby RO from the proposed RO Location): ${form.nearbyRODistanceNote}`,
    ``,
    ``,
    `${form.preparedBy}`,
    `${form.designation}`,
  ].join("\n");
}
