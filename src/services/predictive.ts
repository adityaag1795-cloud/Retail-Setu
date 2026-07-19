import type { Outlet, SalesRecord, TankStock, AnalyticsAnswer } from "../types.js";
import { store } from "../store.js";
import { getAiEngine } from "./aiEngine.js";

const LOOKBACK_DAYS = 60;

function recentRecords(outletId: string, days = LOOKBACK_DAYS): SalesRecord[] {
  return store.salesRecords.filter((r) => r.outletId === outletId).slice(-days);
}

export function monthlyKL(outletId: string, days = 30): number {
  const recs = recentRecords(outletId, days);
  const total = recs.reduce((acc, r) => acc + r.msKL + r.hsdKL, 0);
  return Number(total.toFixed(1));
}

/** Real per-product tank stock/ullage for an outlet, as reported by the live SAP feed (if any). */
export function outletTankStock(outletId: string): TankStock[] {
  return store.stockSnapshots.filter((s) => s.outletId === outletId);
}

/** True/false from the real tank feed where one exists for this outlet; null if no feed is available. */
export function isDryByStock(outlet: Outlet): boolean | null {
  const rows = outletTankStock(outlet.id);
  if (!rows.length) return null;
  return rows.some((r) => r.pumpableStockLtr <= 0);
}

/** Products currently below `thresholdPct` of tank capacity, from the real stock feed. */
export function lowStockProducts(outlet: Outlet, thresholdPct = 15): { product: string; pct: number; stockQtyLtr: number; capacityLtr: number }[] {
  return outletTankStock(outlet.id)
    .map((r) => ({
      product: r.product,
      pct: r.capacityLtr > 0 ? Number(((r.stockQtyLtr / r.capacityLtr) * 100).toFixed(1)) : 0,
      stockQtyLtr: r.stockQtyLtr,
      capacityLtr: r.capacityLtr,
    }))
    .filter((x) => x.pct < thresholdPct);
}

/** Outlets with any product currently below `thresholdPct` of tank capacity, per the real stock feed. */
export function outletsLowOnStock(thresholdPct = 15): { outlet: Outlet; products: { product: string; pct: number; stockQtyLtr: number; capacityLtr: number }[] }[] {
  return [...store.outlets.values()]
    .filter((o) => o.status === "Operational")
    .map((o) => ({ outlet: o, products: lowStockProducts(o, thresholdPct) }))
    .filter((x) => x.products.length > 0);
}

/** Prefers the real tank-stock feed where available; falls back to the sales-based proxy otherwise. */
export function isDryToday(outlet: Outlet): boolean {
  const stockBased = isDryByStock(outlet);
  if (stockBased !== null) return stockBased;
  const today = store.salesRecords
    .filter((r) => r.outletId === outlet.id)
    .slice(-1)[0];
  return !!today && today.msKL === 0 && today.hsdKL === 0;
}

export function dryDayCount(outletId: string, days = LOOKBACK_DAYS): number {
  return recentRecords(outletId, days).filter((r) => r.msKL === 0 && r.hsdKL === 0).length;
}

export function outletsBelowTA(): { outlet: Outlet; actualKL: number; taAverageKL: number }[] {
  return [...store.outlets.values()]
    .filter((o) => o.status === "Operational")
    .map((o) => ({ outlet: o, actualKL: monthlyKL(o.id), taAverageKL: o.taAverageKL }))
    .filter((x) => x.actualKL < x.taAverageKL);
}

export function dryOutletsToday(): Outlet[] {
  return [...store.outlets.values()].filter((o) => o.status === "Operational" && isDryToday(o));
}

export function highMsLowHsdOutlets(msThresholdKL = 100, hsdThresholdKL = 10): { outlet: Outlet; msKL: number; hsdKL: number }[] {
  return [...store.outlets.values()]
    .filter((o) => o.status === "Operational")
    .map((o) => {
      const recs = recentRecords(o.id, 30);
      const msKL = recs.reduce((a, r) => a + r.msKL, 0);
      const hsdKL = recs.reduce((a, r) => a + r.hsdKL, 0);
      return { outlet: o, msKL: Number(msKL.toFixed(1)), hsdKL: Number(hsdKL.toFixed(1)) };
    })
    .filter((x) => x.msKL > msThresholdKL && x.hsdKL < hsdThresholdKL);
}

export function frequentLowStock(minDryDays = 3): { outlet: Outlet; dryDays: number }[] {
  return [...store.outlets.values()]
    .filter((o) => o.status === "Operational")
    .map((o) => ({ outlet: o, dryDays: dryDayCount(o.id) }))
    .filter((x) => x.dryDays >= minDryDays);
}

export function dailySummary() {
  return {
    generatedAt: new Date().toISOString(),
    source: "CRIS" as const,
    belowTA: outletsBelowTA().map((x) => ({ outletId: x.outlet.id, name: x.outlet.name, actualKL: x.actualKL, taAverageKL: x.taAverageKL })),
    dryToday: dryOutletsToday().map((o) => ({ outletId: o.id, name: o.name })),
    frequentlyDry: frequentLowStock().map((x) => ({ outletId: x.outlet.id, name: x.outlet.name, dryDays: x.dryDays })),
    highMsLowHsd: highMsLowHsdOutlets().map((x) => ({ outletId: x.outlet.id, name: x.outlet.name, msKL: x.msKL, hsdKL: x.hsdKL })),
    lowOnStockToday: outletsLowOnStock().map((x) => ({ outletId: x.outlet.id, name: x.outlet.name, products: x.products })),
  };
}

/** "Ask anything" analytical query — rule-based intent matching over the SO's most common questions. */
export async function askAnalytics(question: string): Promise<AnalyticsAnswer> {
  const q = question.toLowerCase();
  let resultSummary: string;
  let matchedOutletIds: string[] = [];

  if (q.includes("below") && (q.includes("ta") || q.includes("trading area"))) {
    const rows = outletsBelowTA();
    matchedOutletIds = rows.map((r) => r.outlet.id);
    resultSummary = rows.length
      ? `${rows.length} outlet(s) below TA average: ${rows.map((r) => `${r.outlet.name} (${r.actualKL} KL vs TA ${r.taAverageKL} KL)`).join("; ")}.`
      : "No outlets currently below their TA average.";
  } else if (q.includes("dry")) {
    const rows = dryOutletsToday();
    matchedOutletIds = rows.map((o) => o.id);
    resultSummary = rows.length ? `${rows.length} outlet(s) dry today: ${rows.map((o) => o.name).join(", ")}.` : "No outlets are dry today.";
  } else if (q.includes("100") || (q.includes("ms") && q.includes("hsd"))) {
    const rows = highMsLowHsdOutlets();
    matchedOutletIds = rows.map((r) => r.outlet.id);
    resultSummary = rows.length
      ? `${rows.length} outlet(s) selling >100 KL MS but <10 KL HSD (30-day): ${rows.map((r) => `${r.outlet.name} (MS ${r.msKL} / HSD ${r.hsdKL})`).join("; ")}.`
      : "No outlets currently match the >100 KL MS / <10 KL HSD skew.";
  } else if (q.includes("tank") || q.includes("ullage") || (q.includes("stock") && (q.includes("today") || q.includes("now") || q.includes("current")))) {
    const rows = outletsLowOnStock();
    matchedOutletIds = rows.map((r) => r.outlet.id);
    resultSummary = rows.length
      ? `${rows.length} outlet(s) currently low on tank stock (live SAP feed): ${rows.map((r) => `${r.outlet.name} (${r.products.map((p) => `${p.product} ${p.pct}% of capacity`).join(", ")})`).join("; ")}.`
      : "No outlets are currently low on tank stock per the live feed.";
  } else if (q.includes("low stock") || q.includes("stock")) {
    const rows = frequentLowStock();
    matchedOutletIds = rows.map((r) => r.outlet.id);
    resultSummary = rows.length
      ? `${rows.length} outlet(s) with frequent low-stock/dry incidents (60-day): ${rows.map((r) => `${r.outlet.name} (${r.dryDays} dry days)`).join("; ")}.`
      : "No outlets show a frequent low-stock pattern.";
  } else {
    resultSummary = "I can currently answer questions about: outlets below TA average, which outlets are dry today, MS/HSD sales skew, and low-stock frequency. Try one of those, or extend `askAnalytics` for new intents.";
  }

  const answer = await getAiEngine().generate("analyticsAnswer", { question, resultSummary });
  return { question, answer, matchedOutletIds };
}
