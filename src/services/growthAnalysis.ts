/**
 * Module 1 outlet page — this outlet's MS/HSD/Power volume growth or degrowth, year-over-year on
 * the latest real CY month on file (the same target=LY/achieved=CY basis as the KPI Tracker — see
 * kpiTracker.ts), paired with the real DU transaction-log signals (slab-wise mix trend, DU uptime)
 * that can help read WHY, where a transaction log actually exists for that outlet.
 *
 * One honest limitation: the volume comparison here is year-over-year (this outlet's DSR only
 * goes back that far), while the transaction log only covers Feb-2026 onward. So the slab trend
 * below is its own month-over-month read over the log's real window, not a rigorous decomposition
 * of the YoY growth number — a strongly suggestive real signal, not a proven attribution.
 */
import type { Outlet } from "../types.js";
import { kpiTracker } from "./kpiTracker.js";
import { hasTrafficData, slabTrendNarrative, duUptimeSummary, nozzleStatusForOutlet } from "./trafficAnalytics.js";

const GROWTH_PRODUCTS = ["MS (Petrol)", "HSD (Diesel)", "Power"];

/**
 * The latest CY month on file is very likely the current, still-in-progress fiscal month — the
 * DSR extract this app was seeded from has no explicit "as of" day count, so there's no reliable
 * way to day-normalize it here. A large apparent degrowth on that month specifically can be
 * partly (or entirely) just fewer days reported so far, not a real decline.
 */
export const PARTIAL_MONTH_CAVEAT =
  "The latest month shown is very likely still in progress (not yet a complete calendar month) — part or all of an apparent decline here may simply be fewer days reported so far, not a real drop. Cross-check against the prior complete month in the product comparison above before treating a swing here as a genuine trend.";

export interface OutletProductGrowth {
  product: string;
  unit: string;
  month: string; // latest CY month label on file, e.g. "Jul-26"
  target: number; // LY same fiscal month
  achieved: number | null; // CY same month
  growthPct: number | null;
  direction: "up" | "down" | "flat" | "no-data";
}

export interface OutletGrowthReport {
  outletId: string;
  outletName: string;
  products: OutletProductGrowth[];
  hasTransactionLog: boolean;
  slabNarrative: string[];
  duUptime: { uptimePct: number; daysOnFile: number; totalDays: number; gaps: { startDate: string; endDate: string; days: number }[] } | null;
  inactiveNozzleCount: number;
}

/** Returns null when the outlet has no real DSR product-comparison data on file at all. */
export function outletGrowthReport(outlet: Outlet): OutletGrowthReport | null {
  if (!outlet.productComparison) return null;

  const summaries = kpiTracker(outlet.id);
  const products: OutletProductGrowth[] = GROWTH_PRODUCTS.map((label) => {
    const summary = summaries.find((s) => s.product === label);
    const last = summary?.months[summary.months.length - 1];
    if (!last) {
      return { product: label, unit: label === "Power" ? "units" : "KL", month: "-", target: 0, achieved: null, growthPct: null, direction: "no-data" as const };
    }
    const growthPct = last.target > 0 && last.achieved !== null ? Math.round(((last.achieved - last.target) / last.target) * 1000) / 10 : null;
    const direction: OutletProductGrowth["direction"] =
      growthPct === null ? "no-data" : growthPct > 0.5 ? "up" : growthPct < -0.5 ? "down" : "flat";
    return { product: label, unit: summary!.unit, month: last.label, target: last.target, achieved: last.achieved, growthPct, direction };
  });

  const hasLog = hasTrafficData(outlet.id);
  return {
    outletId: outlet.id,
    outletName: outlet.name,
    products,
    hasTransactionLog: hasLog,
    slabNarrative: hasLog
      ? slabTrendNarrative(outlet.id)
      : ["No real DU transaction log on file for this outlet — cannot attribute the volume movement to a specific transaction slab."],
    duUptime: hasLog ? duUptimeSummary(outlet.id) : null,
    inactiveNozzleCount: nozzleStatusForOutlet(outlet.id).filter((n) => n.possiblyInactive).length,
  };
}
