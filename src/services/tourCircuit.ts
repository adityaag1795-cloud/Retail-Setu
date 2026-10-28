/**
 * SO Cockpit / Module 3 — a suggested tour circuit: which outlets the SO should actually visit
 * next, and in what order. Pulls together every real risk/opportunity signal already computed
 * elsewhere in this app (dry-today stock feed, Outlet Criticality Monitor, ITPS inactivity, real
 * trading-area competitive average, DU inactivity, sales-trend x stock cross-signals, sudden YoY
 * dips, overdue MOM action points) into one weighted priority score per outlet, then sequences the
 * highest-priority outlets into a route using each outlet's real lat/lng (nearest-neighbour from
 * the top-priority outlet) so the SO isn't zigzagging across the sales area. Nothing here is a
 * fabricated recommendation — every stop traces back to a real, already-verified signal, and an
 * outlet with none of these signals simply never appears.
 */
import { store } from "../store.js";
import type { Outlet } from "../types.js";
import { dryOutletsToday, frequentLowStock, outletsBelowTA } from "./predictive.js";
import { outletsWithInactiveNozzles } from "./trafficAnalytics.js";
import { dryRiskWithoutCover, itpsInactiveOutlets, stockVsSalesInsights, suddenSalesMoves } from "./predictiveInsights.js";

const REASON_WEIGHT = {
  dryToday: 100,
  dryRiskHigh: 95,
  dryRiskMedium: 70,
  dryRiskLow: 50,
  dipMayGoDry: 85,
  itpsInactive: 65,
  frequentlyDry: 60,
  belowTA: 55,
  risingButLowStock: 50,
  overdueMOM: 45,
  inactiveDU: 40,
  suddenDip: 35,
} as const;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export interface TourStop {
  order: number;
  outletId: string;
  outletName: string;
  district: string;
  priorityScore: number;
  reasons: string[];
  distanceFromPrevKm: number | null;
}

/**
 * Top `maxStops` outlets by combined real-signal priority, sequenced geographically. Returns an
 * empty list (not a fabricated one) when no outlet currently has any of these signals active.
 */
export function suggestedTourCircuit(maxStops = 3): TourStop[] {
  const byOutlet = new Map<string, { weight: number; reasons: string[] }>();
  const add = (outletId: string, label: string, weight: number) => {
    const cur = byOutlet.get(outletId) ?? { weight: 0, reasons: [] };
    cur.weight += weight;
    cur.reasons.push(label);
    byOutlet.set(outletId, cur);
  };

  for (const outlet of dryOutletsToday()) add(outlet.id, "Dry today (live stock feed)", REASON_WEIGHT.dryToday);

  for (const row of dryRiskWithoutCover()) {
    const w = row.criticality === "HIGH" ? REASON_WEIGHT.dryRiskHigh : row.criticality === "MEDIUM" ? REASON_WEIGHT.dryRiskMedium : REASON_WEIGHT.dryRiskLow;
    add(row.outletId, `Dry/going dry, ${row.criticality.toLowerCase()} criticality, no cover (Criticality Monitor)`, w);
  }

  for (const row of itpsInactiveOutlets()) add(row.outletId, `No ITPS transactions in ${row.days} day(s)`, REASON_WEIGHT.itpsInactive);

  for (const row of frequentLowStock()) add(row.outlet.id, `Frequently dry — ${row.dryDays} day(s) in the last 60`, REASON_WEIGHT.frequentlyDry);

  for (const row of outletsBelowTA()) add(row.outlet.id, `Below ${row.tradingAreaName} average (${row.pctOfAverage}% of peers)`, REASON_WEIGHT.belowTA);

  for (const row of outletsWithInactiveNozzles()) add(row.outletId, "Possibly inactive DU(s)", REASON_WEIGHT.inactiveDU);

  for (const row of stockVsSalesInsights()) {
    add(row.outletId, row.kind === "dipMayGoDry" ? "Sales collapse + near-dry stock" : "High-selling but stock running low", row.kind === "dipMayGoDry" ? REASON_WEIGHT.dipMayGoDry : REASON_WEIGHT.risingButLowStock);
  }

  for (const row of suddenSalesMoves()) {
    if (row.direction !== "down") continue;
    add(row.outletId, `Sudden sales dip — ${row.product} down ${Math.abs(row.growthPct)}% YoY`, REASON_WEIGHT.suddenDip);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const ap of store.actionPoints.values()) {
    if (!ap.dueDate || ap.status === "Done" || ap.dueDate >= today) continue;
    add(ap.outletId, `Overdue MOM action point — "${ap.title}"`, REASON_WEIGHT.overdueMOM);
  }

  const candidates = [...byOutlet.entries()]
    .map(([outletId, v]) => ({ outlet: store.outlets.get(outletId), weight: v.weight, reasons: v.reasons }))
    .filter((c): c is { outlet: Outlet; weight: number; reasons: string[] } => c.outlet != null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxStops);

  if (candidates.length === 0) return [];

  // Nearest-neighbour route, starting from the highest-priority outlet.
  const remaining = [...candidates];
  const route = [remaining.shift()!];
  while (remaining.length) {
    const last = route[route.length - 1]!.outlet.location;
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((c, i) => {
      const d = haversineKm(last, c.outlet.location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    route.push(remaining.splice(bestIdx, 1)[0]!);
  }

  return route.map((c, i) => ({
    order: i + 1,
    outletId: c.outlet.id,
    outletName: c.outlet.name,
    district: c.outlet.district,
    priorityScore: c.weight,
    reasons: c.reasons,
    distanceFromPrevKm: i === 0 ? null : Math.round(haversineKm(route[i - 1]!.outlet.location, c.outlet.location) * 10) / 10,
  }));
}
