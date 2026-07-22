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
import { outletTankStock } from "./predictive.js";

const LOW_STOCK_PCT = 20;
const DRY_RISK_STOCK_PCT = 15;
const RISING_GROWTH_PCT = 15;
const COLLAPSE_GROWTH_PCT = -50;
const SUDDEN_MOVE_PCT = 30;

function worstStockPct(outletId: string): { product: string; pct: number } | null {
  const rows = outletTankStock(outletId);
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
