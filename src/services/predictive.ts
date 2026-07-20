import type { Outlet, SalesRecord, TankStock, AnalyticsAnswer, TaskItem } from "../types.js";
import { store, nextId } from "../store.js";
import { getAiEngine } from "./aiEngine.js";
import {
  hasTrafficData,
  vehicleTypeAverages,
  productAverages,
  peakHour,
  nozzleStatusForOutlet,
  outletsWithInactiveNozzles,
  VEHICLE_TYPE_LABELS,
} from "./trafficAnalytics.js";
import type { VehicleType } from "../types.js";

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

function hasOpenTask(outletId: string, title: string): boolean {
  return [...store.tasks.values()].some(
    (t) => t.linkedModule === "Outlet" && t.linkedRecordId === outletId && t.title === title && t.status !== "Done",
  );
}

function createOutletTask(outlet: Outlet, title: string, description: string, priority: TaskItem["priority"], urgent: boolean) {
  const so = [...store.team.values()].find((t) => t.role === "SO");
  if (!so) return;
  const task: TaskItem = {
    id: nextId("TASK"),
    title,
    description,
    assignedTo: so.id,
    assignedBy: "System",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "Open",
    priority,
    urgent,
    important: true,
    linkedModule: "Outlet",
    linkedRecordId: outlet.id,
    createdAt: new Date().toISOString(),
  };
  store.tasks.set(task.id, task);
}

/**
 * Closes the loop from "Module 3 noticed something" to "it's a tracked task" — the same pattern
 * already used for dealer requests and stuck milestones, applied to persistent predictive
 * signals instead of leaving them as a page the SO has to remember to check. Idempotent: run it
 * as often as you like (called whenever Module 3 or the Cockpit is opened) — it only creates a
 * task once per still-open signal, and a new one only after the previous task is resolved.
 */
export function syncPredictiveAlerts(): void {
  for (const outlet of dryOutletsToday()) {
    const title = `Dry outlet — ${outlet.name}`;
    if (!hasOpenTask(outlet.id, title)) {
      createOutletTask(outlet, title, `${outlet.name} is dry today per the live stock/sales feed — check tanker scheduling.`, "High", true);
    }
  }
  for (const { outlet, actualKL, taAverageKL } of outletsBelowTA()) {
    if (taAverageKL <= 0 || actualKL >= taAverageKL * 0.8) continue; // only meaningfully below, not noise
    const title = `Below TA average — ${outlet.name}`;
    if (!hasOpenTask(outlet.id, title)) {
      createOutletTask(
        outlet,
        title,
        `${outlet.name}: 30-day throughput ${actualKL} KL vs TA average ${taAverageKL} KL (${Math.round((actualKL / taAverageKL) * 100)}%) — investigate.`,
        "Medium",
        false,
      );
    }
  }
  for (const { outletId, nozzles } of outletsWithInactiveNozzles()) {
    const outlet = store.outlets.get(outletId);
    if (!outlet) continue;
    const title = `Possibly inactive DU(s) — ${outlet.name}`;
    if (!hasOpenTask(outlet.id, title)) {
      const list = nozzles.map((n) => `Pump ${n.pumpNo}/Nozzle ${n.nozzleNo} (last transaction ${n.lastTransactionAt.slice(0, 10)})`).join(", ");
      createOutletTask(outlet, title, `${outlet.name}: ${nozzles.length} dispensing unit(s) look inactive per the DU transaction log — ${list}. Verify if genuinely down.`, "High", true);
    }
  }
}

/** Finds an outlet mentioned by name in free text — used by askAnalytics for outlet-specific intents. */
function matchOutletInText(text: string): Outlet | undefined {
  const lower = text.toLowerCase();
  let best: Outlet | undefined;
  for (const outlet of store.outlets.values()) {
    if (lower.includes(outlet.name.toLowerCase())) {
      if (!best || outlet.name.length > best.name.length) best = outlet;
    }
  }
  return best;
}

/** "Ask anything" analytical query — rule-based intent matching over the SO's most common questions. */
export async function askAnalytics(question: string): Promise<AnalyticsAnswer> {
  const q = question.toLowerCase();
  let resultSummary: string;
  let matchedOutletIds: string[] = [];
  const mentionedOutlet = matchOutletInText(question);

  if (q.includes("peak") && (q.includes("hour") || q.includes("time"))) {
    if (mentionedOutlet && hasTrafficData(mentionedOutlet.id)) {
      const peak = peakHour(mentionedOutlet.id, 7)!;
      matchedOutletIds = [mentionedOutlet.id];
      resultSummary = `${mentionedOutlet.name}: peak hour is ${peak.hour}:00-${peak.hour + 1}:00 with ${peak.transactions} transactions (real DU transaction log).`;
    } else if (mentionedOutlet) {
      resultSummary = `No DU transaction data uploaded for ${mentionedOutlet.name} yet — can't determine peak hours. Upload one via the Input Tap on the Outlet Repository page.`;
    } else {
      const withData = [...store.outlets.values()].filter((o) => hasTrafficData(o.id));
      resultSummary = withData.length
        ? `Peak-hour analysis is available for: ${withData.map((o) => o.name).join(", ")}. Ask "peak hour at <outlet name>".`
        : `No outlet has DU transaction data uploaded yet — nothing to compute peak hours from.`;
    }
  } else if (q.includes("du") || q.includes("nozzle") || q.includes("dispensing unit") || q.includes("pump")) {
    if (mentionedOutlet && hasTrafficData(mentionedOutlet.id)) {
      const nozzles = nozzleStatusForOutlet(mentionedOutlet.id);
      const inactive = nozzles.filter((n) => n.possiblyInactive);
      matchedOutletIds = [mentionedOutlet.id];
      resultSummary = inactive.length
        ? `${mentionedOutlet.name}: ${inactive.length} of ${nozzles.length} DU(s) look inactive — ${inactive.map((n) => `Pump ${n.pumpNo}/Nozzle ${n.nozzleNo} (last transaction ${n.lastTransactionAt.slice(0, 10)})`).join(", ")}. The rest are transacting normally.`
        : `${mentionedOutlet.name}: all ${nozzles.length} DU(s) show recent transactions — no inactivity detected in the real transaction log.`;
    } else if (mentionedOutlet) {
      resultSummary = `No DU transaction data uploaded for ${mentionedOutlet.name} yet — can't assess DU status.`;
    } else {
      const flagged = outletsWithInactiveNozzles();
      resultSummary = flagged.length
        ? `${flagged.length} outlet(s) have a possibly-inactive DU: ${flagged.map((f) => store.outlets.get(f.outletId)?.name ?? f.outletId).join(", ")}.`
        : `No possibly-inactive DUs detected across outlets with transaction data on file.`;
    }
  } else if (q.includes("traffic") || q.includes("vehicle") || q.includes("wheeler") || q.includes("hmv") || q.includes("bowser")) {
    if (mentionedOutlet && hasTrafficData(mentionedOutlet.id)) {
      const { perDay, daysAveraged } = vehicleTypeAverages(mentionedOutlet.id, 7);
      matchedOutletIds = [mentionedOutlet.id];
      resultSummary = `${mentionedOutlet.name} traffic pattern — daily average over the last ${daysAveraged} day(s) (real DU log): ${(Object.keys(perDay) as VehicleType[]).map((vt) => `${VEHICLE_TYPE_LABELS[vt]} ${perDay[vt].transactions.toFixed(1)} txns/day (${perDay[vt].volumeKL.toFixed(2)} KL/day)`).join(", ")}.`;
    } else if (mentionedOutlet) {
      resultSummary = `No DU transaction data uploaded for ${mentionedOutlet.name} yet — can't show a traffic pattern. Upload one via the Input Tap.`;
    } else {
      const withData = [...store.outlets.values()].filter((o) => hasTrafficData(o.id));
      resultSummary = withData.length
        ? `Traffic-pattern data is available for: ${withData.map((o) => o.name).join(", ")}. Ask "traffic pattern at <outlet name>".`
        : `No outlet has DU transaction data uploaded yet.`;
    }
  } else if ((q.includes("fuel") || q.includes("ms") || q.includes("hsd")) && (q.includes("pattern") || q.includes("trend")) && mentionedOutlet && hasTrafficData(mentionedOutlet.id)) {
    const { perDay, daysAveraged } = productAverages(mentionedOutlet.id, 7);
    matchedOutletIds = [mentionedOutlet.id];
    resultSummary = `${mentionedOutlet.name} fuel sales pattern — daily average over the last ${daysAveraged} day(s) (real DU log): ${Object.entries(perDay).map(([p, c]) => `${p} — ${c.transactions.toFixed(1)} txns/day, ${c.volumeKL.toFixed(2)} KL/day, Rs ${Math.round(c.amountRs).toLocaleString("en-IN")}/day`).join("; ")}.`;
  } else if (q.includes("below") && (q.includes("ta") || q.includes("trading area"))) {
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
