/**
 * Module 4 — KPI Tracker: how much of the year's target has been covered, using last year's
 * real monthly actual (per product, per outlet) as the target baseline — exactly what the SO
 * asked for ("target as of last year"), not a fabricated growth-projected target. Built from the
 * same real DSR month-wise LY/CY data that feeds the Module 1 outlet comparison tables (see
 * data/productComparisonData.ts), aggregated across outlets (or a single outlet, if asked for).
 */
import { store } from "../store.js";
import type { OutletProductComparison } from "../types.js";

export interface KpiMonthRow {
  month: string; // "YYYY-MM", the CY (achieved) month
  label: string; // "Apr-26"
  target: number; // last year's actual for the same fiscal month
  achieved: number; // this year's actual so far
  coveragePct: number | null; // achieved/target*100 — null if target is 0 (can't compute a %)
}

export interface KpiProductSummary {
  product: string;
  unit: string;
  months: KpiMonthRow[];
  yoyTarget: number;
  yoyAchieved: number;
  yoyCoveragePct: number | null;
}

const PRODUCTS: { key: keyof OutletProductComparison; label: string; unit: string }[] = [
  { key: "ms", label: "MS (Petrol)", unit: "KL" },
  { key: "hsd", label: "HSD (Diesel)", unit: "KL" },
  { key: "lube", label: "Lube", unit: "KL" },
  { key: "power", label: "Power", unit: "units" },
  { key: "def", label: "DEF", unit: "KL" },
];

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y!, mo! - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** outletId scopes to one outlet; omit for the whole set of outlets carrying real DSR data. */
export function kpiTracker(outletId?: string): KpiProductSummary[] {
  const outlets = outletId ? [store.outlets.get(outletId)].filter((o): o is NonNullable<typeof o> => !!o) : [...store.outlets.values()];

  return PRODUCTS.map(({ key, label, unit }) => {
    const byMonth = new Map<string, { target: number; achieved: number }>();
    for (const outlet of outlets) {
      const series = outlet.productComparison?.[key];
      if (!series) continue;
      const n = Math.max(series.ly.length, series.cy.length);
      for (let i = 0; i < n; i++) {
        const cy = series.cy[i];
        if (!cy) continue; // only report months that have actually started
        const ly = series.ly[i];
        const agg = byMonth.get(cy.month) ?? { target: 0, achieved: 0 };
        agg.target += ly?.value ?? 0;
        agg.achieved += cy.value;
        byMonth.set(cy.month, agg);
      }
    }
    const months: KpiMonthRow[] = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, { target, achieved }]) => ({
        month,
        label: monthLabel(month),
        target: round2(target),
        achieved: round2(achieved),
        coveragePct: target > 0 ? Math.round((achieved / target) * 1000) / 10 : null,
      }));
    const yoyTarget = round2(months.reduce((s, m) => s + m.target, 0));
    const yoyAchieved = round2(months.reduce((s, m) => s + m.achieved, 0));
    return {
      product: label,
      unit,
      months,
      yoyTarget,
      yoyAchieved,
      yoyCoveragePct: yoyTarget > 0 ? Math.round((yoyAchieved / yoyTarget) * 1000) / 10 : null,
    };
  }).filter((p) => p.months.length > 0);
}

export interface SalesAreaPeriodFigure {
  achieved: number;
  target: number;
  coveragePct: number | null;
}

export interface SalesAreaProductSummary {
  product: string;
  unit: string;
  currentMonthLabel: string;
  currentMonth: SalesAreaPeriodFigure;
  yearToDate: SalesAreaPeriodFigure;
}

/**
 * Module 3 sales-area summary — current month and year-to-date real actuals (target = last
 * year's same-period actual), derived from the same per-product KPI data. outletId scopes to
 * one outlet; omit for the whole set of outlets carrying real DSR data.
 */
export function salesAreaSummary(outletId?: string): SalesAreaProductSummary[] {
  return kpiTracker(outletId).map((p) => {
    const last = p.months[p.months.length - 1]!;
    return {
      product: p.product,
      unit: p.unit,
      currentMonthLabel: last.label,
      currentMonth: { achieved: last.achieved, target: last.target, coveragePct: last.coveragePct },
      yearToDate: { achieved: p.yoyAchieved, target: p.yoyTarget, coveragePct: p.yoyCoveragePct },
    };
  });
}
