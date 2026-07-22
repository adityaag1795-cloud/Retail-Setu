/**
 * Module 3 — real cross-signal predictive insights: combines each outlet's real YoY product
 * growth (growthAnalysis.ts — same DSR-based target/achieved basis as the KPI Tracker) with its
 * real current tank-stock snapshot (where one exists) to surface exactly the kind of judgment call
 * an SO would make by eye — "this outlet is selling well but running low," "this one just
 * collapsed and may go dry." Every insight only fires for outlets that genuinely have both signals
 * on file; nothing here is invented for an outlet missing either one.
 *
 * Per growthAnalysis.ts's PARTIAL_MONTH_CAVEAT, the latest month on file is very likely still in
 * progress, so a single month's dip/growth is a suggestive real signal, not a proven trend —
 * carried through into every message below.
 */
import { store } from "../store.js";
import { outletGrowthReport } from "./growthAnalysis.js";

const LOW_STOCK_PCT = 20;
const DRY_RISK_STOCK_PCT = 15;
const RISING_GROWTH_PCT = 15;
const COLLAPSE_GROWTH_PCT = -50;
const SUDDEN_MOVE_PCT = 30;

function worstStockPct(outletId: string): { product: string; pct: number } | null {
  const rows = store.stockSnapshots.filter((s) => s.outletId === outletId);
  let worst: { product: string; pct: number } | null = null;
  for (const r of rows) {
    if (r.capacityLtr <= 0) continue;
    const pct = Math.round((r.pumpableStockLtr / r.capacityLtr) * 1000) / 10;
    if (worst === null || pct < worst.pct) worst = { product: r.product, pct };
  }
  return worst;
}

export interface StockVsSalesInsight {
  outletId: string;
  outletName: string;
  kind: "risingButLowStock" | "dipMayGoDry";
  message: string;
}

/** Outlets with a real stock snapshot AND real YoY growth data that show a genuine, actionable pattern. */
export function stockVsSalesInsights(): StockVsSalesInsight[] {
  const insights: StockVsSalesInsight[] = [];
  for (const outlet of store.outlets.values()) {
    if (outlet.status !== "Operational") continue;
    const stock = worstStockPct(outlet.id);
    if (stock === null) continue; // no real tank-stock snapshot on file for this outlet
    const growth = outletGrowthReport(outlet);
    if (!growth) continue; // no real DSR product-comparison data on file for this outlet

    const rising = growth.products.filter((p) => p.growthPct != null && p.growthPct >= RISING_GROWTH_PCT);
    if (rising.length && stock.pct < LOW_STOCK_PCT) {
      insights.push({
        outletId: outlet.id,
        outletName: outlet.name,
        kind: "risingButLowStock",
        message: `${outlet.name} is a high-selling outlet right now (${rising.map((p) => `${p.product} up ${p.growthPct}%`).join(", ")} vs last year) but ${stock.product} stock is down to ${stock.pct}% of capacity — replenish before it constrains sales.`,
      });
    }

    const collapsed = growth.products.filter((p) => p.growthPct != null && p.growthPct <= COLLAPSE_GROWTH_PCT);
    if (collapsed.length && stock.pct < DRY_RISK_STOCK_PCT) {
      insights.push({
        outletId: outlet.id,
        outletName: outlet.name,
        kind: "dipMayGoDry",
        message: `${outlet.name}: ${collapsed.map((p) => `${p.product} down ${Math.abs(p.growthPct!)}%`).join(", ")} vs last year, and ${stock.product} stock is at ${stock.pct}% of capacity — may go dry today/soon if stock hasn't been replenished.`,
      });
    }
  }
  return insights;
}

export interface SuddenSalesMove {
  outletId: string;
  outletName: string;
  product: string;
  growthPct: number;
  direction: "up" | "down";
}

/** Every real product/outlet YoY swing of at least SUDDEN_MOVE_PCT, worst/most-dramatic first. */
export function suddenSalesMoves(): SuddenSalesMove[] {
  const rows: SuddenSalesMove[] = [];
  for (const outlet of store.outlets.values()) {
    if (outlet.status !== "Operational") continue;
    const growth = outletGrowthReport(outlet);
    if (!growth) continue;
    for (const p of growth.products) {
      if (p.growthPct == null || Math.abs(p.growthPct) < SUDDEN_MOVE_PCT) continue;
      rows.push({ outletId: outlet.id, outletName: outlet.name, product: p.product, growthPct: p.growthPct, direction: p.growthPct > 0 ? "up" : "down" });
    }
  }
  return rows.sort((a, b) => Math.abs(b.growthPct) - Math.abs(a.growthPct));
}

export interface DryRiskWithoutCoverRow {
  outletId: string;
  outletName: string;
  dryProducts: string[]; // e.g. ["MS", "HSD (intraday)"]
  indentPlaced: boolean;
  fundsAvailable: boolean;
  criticality: "HIGH" | "MEDIUM" | "LOW";
  message: string;
}

/**
 * Real outlets that are (or are about to go, intraday) dry in MS/HSD per HPCL's own Outlet
 * Criticality Monitor workbook, where an indent hasn't actually been placed or funds aren't
 * available to cover one — i.e. genuinely at risk with nothing already in motion to fix it. An
 * outlet that's dry but already has both an indent placed and funds available is left out, since
 * the fix is already underway. Only covers outlets present in that workbook.
 */
export function dryRiskWithoutCover(): DryRiskWithoutCoverRow[] {
  const rows: DryRiskWithoutCoverRow[] = [];
  for (const row of store.criticalityMonitor) {
    const outlet = store.outlets.get(row.outletId);
    if (!outlet) continue;
    const dryProducts: string[] = [];
    if (row.dryMS) dryProducts.push("MS");
    else if (row.dryMSIntraday) dryProducts.push("MS (intraday)");
    if (row.dryHSD) dryProducts.push("HSD");
    else if (row.dryHSDIntraday) dryProducts.push("HSD (intraday)");
    if (dryProducts.length === 0) continue; // not dry at all — no risk to flag
    if (row.indentPlaced && row.fundsAvailable) continue; // already covered

    const reasons: string[] = [];
    if (!row.indentPlaced) reasons.push("indent not placed");
    if (!row.fundsAvailable) reasons.push("funds not available");
    rows.push({
      outletId: outlet.id,
      outletName: outlet.name,
      dryProducts,
      indentPlaced: row.indentPlaced,
      fundsAvailable: row.fundsAvailable,
      criticality: row.criticality,
      message: `${outlet.name}: dry/going dry in ${dryProducts.join(" & ")} — ${reasons.join(" and ")} (criticality: ${row.criticality}).`,
    });
  }
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return rows.sort((a, b) => rank[a.criticality] - rank[b.criticality]);
}

const ITPS_TREND_PCT = 20;
const ITPS_INACTIVE_DAYS = 2;

function itpsDaysForOutlet(outletId: string) {
  return store.itpsTransactions.filter((r) => r.outletId === outletId).sort((a, b) => a.date.localeCompare(b.date));
}

export interface ItpsTrendRow {
  outletId: string;
  outletName: string;
  firstHalfAvg: number;
  secondHalfAvg: number;
  changePct: number;
  direction: "up" | "down";
}

/**
 * Real growing/degrowing ITPS (online) transaction trend per outlet — first half vs second half
 * of whatever days are on file, from HPCL's own Online Transactions report. Only outlets present
 * in that report; only swings of at least ITPS_TREND_PCT are surfaced, worst/best first.
 */
export function itpsGrowthTrend(): ItpsTrendRow[] {
  const outletIds = [...new Set(store.itpsTransactions.map((r) => r.outletId))];
  const rows: ItpsTrendRow[] = [];
  for (const outletId of outletIds) {
    const outlet = store.outlets.get(outletId);
    if (!outlet) continue;
    const days = itpsDaysForOutlet(outletId);
    if (days.length < 4) continue; // not enough days on file for a meaningful first-half/second-half split
    const mid = Math.floor(days.length / 2);
    const firstHalf = days.slice(0, mid);
    const secondHalf = days.slice(mid);
    const firstHalfAvg = Math.round((firstHalf.reduce((s, d) => s + d.total, 0) / firstHalf.length) * 10) / 10;
    const secondHalfAvg = Math.round((secondHalf.reduce((s, d) => s + d.total, 0) / secondHalf.length) * 10) / 10;
    if (firstHalfAvg <= 0) continue;
    const changePct = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 1000) / 10;
    if (Math.abs(changePct) < ITPS_TREND_PCT) continue;
    rows.push({ outletId, outletName: outlet.name, firstHalfAvg, secondHalfAvg, changePct, direction: changePct > 0 ? "up" : "down" });
  }
  return rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

export interface ItpsInactiveRow {
  outletId: string;
  outletName: string;
  days: number;
  lastDates: string[];
}

/**
 * Real outlets with zero ITPS (online) transactions on every one of the last ITPS_INACTIVE_DAYS
 * days actually on file for that outlet — from HPCL's own Online Transactions report.
 */
export function itpsInactiveOutlets(): ItpsInactiveRow[] {
  const outletIds = [...new Set(store.itpsTransactions.map((r) => r.outletId))];
  const rows: ItpsInactiveRow[] = [];
  for (const outletId of outletIds) {
    const outlet = store.outlets.get(outletId);
    if (!outlet) continue;
    const days = itpsDaysForOutlet(outletId);
    if (days.length < ITPS_INACTIVE_DAYS) continue;
    const lastN = days.slice(-ITPS_INACTIVE_DAYS);
    if (lastN.every((d) => d.total === 0)) {
      rows.push({ outletId, outletName: outlet.name, days: ITPS_INACTIVE_DAYS, lastDates: lastN.map((d) => d.date) });
    }
  }
  return rows;
}
