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
  achieved: number | null; // this year's actual so far — null if the source has no CY data at all for this product (e.g. Power)
  coveragePct: number | null; // achieved/target*100 — null if target is 0 or achieved is unavailable
}

export interface KpiProductSummary {
  product: string;
  unit: string;
  months: KpiMonthRow[];
  yoyTarget: number;
  yoyAchieved: number | null;
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

/** Apr=0 .. Mar=11 — position of a "YYYY-MM" month within the Apr-Mar fiscal year. */
function fiscalIndex(monthKey: string): number {
  const mo = Number(monthKey.split("-")[1]);
  return (mo - 4 + 12) % 12;
}

/** outletId scopes to one outlet; omit for the whole set of outlets carrying real DSR data. */
export function kpiTracker(outletId?: string): KpiProductSummary[] {
  const outlets = outletId ? [store.outlets.get(outletId)].filter((o): o is NonNullable<typeof o> => !!o) : [...store.outlets.values()];

  // The real CY months reached so far, in fiscal order — derived from whichever products actually
  // have CY data, so a product with none (Power) can still be reported against the same months.
  const referenceMonths: string[] = [];
  const seenMonths = new Set<string>();
  for (const { key } of PRODUCTS) {
    for (const outlet of outlets) {
      for (const cy of outlet.productComparison?.[key]?.cy ?? []) {
        if (!seenMonths.has(cy.month)) {
          seenMonths.add(cy.month);
          referenceMonths.push(cy.month);
        }
      }
    }
  }
  referenceMonths.sort();

  return PRODUCTS.map(({ key, label, unit }) => {
    const byMonth = new Map<string, { target: number; achieved: number }>();
    let hasAnyLy = false;
    for (const outlet of outlets) {
      const series = outlet.productComparison?.[key];
      if (!series) continue;
      if (series.ly.length) hasAnyLy = true;
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

    let months: KpiMonthRow[];
    if (byMonth.size > 0) {
      months = [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, { target, achieved }]) => ({
          month,
          label: monthLabel(month),
          target: round2(target),
          achieved: round2(achieved),
          coveragePct: target > 0 ? Math.round((achieved / target) * 1000) / 10 : null,
        }));
    } else if (hasAnyLy && referenceMonths.length > 0) {
      // Real target (last year's actual) exists but the source has no CY figure at all for this
      // product (true for Power) — report the target for the record rather than hiding it, but
      // don't fabricate an "achieved" figure that was never supplied.
      months = referenceMonths.map((month) => {
        const idx = fiscalIndex(month);
        let target = 0;
        for (const outlet of outlets) target += outlet.productComparison?.[key]?.ly[idx]?.value ?? 0;
        return { month, label: monthLabel(month), target: round2(target), achieved: null, coveragePct: null };
      });
    } else {
      months = [];
    }

    const yoyTarget = round2(months.reduce((s, m) => s + m.target, 0));
    const hasAchieved = months.some((m) => m.achieved !== null);
    const yoyAchieved = hasAchieved ? round2(months.reduce((s, m) => s + (m.achieved ?? 0), 0)) : null;
    return {
      product: label,
      unit,
      months,
      yoyTarget,
      yoyAchieved,
      yoyCoveragePct: yoyTarget > 0 && yoyAchieved !== null ? Math.round((yoyAchieved / yoyTarget) * 1000) / 10 : null,
    };
  }).filter((p) => p.months.length > 0);
}

export interface SalesAreaPeriodFigure {
  achieved: number | null;
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
