/**
 * Module 3 — real traffic-pattern analytics derived from an outlet's DU (dispensing unit)
 * transaction log, where one has been supplied (via seed data or the Input Tap upload).
 *
 * Vehicle-type classification is the SO's own real rule, applied to each transaction's Amount:
 *   < Rs 500            -> Two-Wheeler
 *   Rs 500 - Rs 10,000   -> Four-Wheeler
 *   Rs 10,000 - Rs 100,000 -> HMV (heavy motor vehicle)
 *   > Rs 100,000         -> Bowser supply
 * Zero-amount rows (void/test swipes) are excluded before classification.
 */
import type { DailyTrafficSummary, NozzleActivity, VehicleType, VehicleTypeCount } from "../types.js";
import { store } from "../store.js";

export function classifyVehicle(amountRs: number): VehicleType {
  if (amountRs < 500) return "TwoWheeler";
  if (amountRs < 10000) return "FourWheeler";
  if (amountRs < 100000) return "HMV";
  return "BowserSupply";
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TwoWheeler: "Two-Wheeler",
  FourWheeler: "Four-Wheeler",
  HMV: "HMV",
  BowserSupply: "Bowser supply",
};

function emptyCount(): VehicleTypeCount {
  return { transactions: 0, volumeKL: 0, amountRs: 0 };
}

export function hasTrafficData(outletId: string): boolean {
  return store.dailyTraffic.some((d) => d.outletId === outletId);
}

export function trafficForOutlet(outletId: string, days?: number): DailyTrafficSummary[] {
  const rows = store.dailyTraffic.filter((d) => d.outletId === outletId).sort((a, b) => a.date.localeCompare(b.date));
  return days ? rows.slice(-days) : rows;
}

/** Aggregates vehicle-type totals for an outlet over its available window (or last `days`). */
export function vehicleTypeTotals(outletId: string, days?: number): Record<VehicleType, VehicleTypeCount> {
  const totals: Record<VehicleType, VehicleTypeCount> = {
    TwoWheeler: emptyCount(),
    FourWheeler: emptyCount(),
    HMV: emptyCount(),
    BowserSupply: emptyCount(),
  };
  for (const day of trafficForOutlet(outletId, days)) {
    for (const vt of Object.keys(totals) as VehicleType[]) {
      const c = day.byVehicleType[vt];
      totals[vt].transactions += c.transactions;
      totals[vt].volumeKL += c.volumeKL;
      totals[vt].amountRs += c.amountRs;
    }
  }
  return totals;
}

/** Real MS-vs-HSD (and any other product) sales pattern from the transaction log, not the sales-record proxy. */
export function productTotals(outletId: string, days?: number): Record<string, VehicleTypeCount> {
  const totals: Record<string, VehicleTypeCount> = {};
  for (const day of trafficForOutlet(outletId, days)) {
    for (const [product, c] of Object.entries(day.byProduct)) {
      const acc = totals[product] ?? emptyCount();
      acc.transactions += c.transactions;
      acc.volumeKL += c.volumeKL;
      acc.amountRs += c.amountRs;
      totals[product] = acc;
    }
  }
  return totals;
}

function divideCount(c: VehicleTypeCount, n: number): VehicleTypeCount {
  return { transactions: c.transactions / n, volumeKL: c.volumeKL / n, amountRs: c.amountRs / n };
}

/**
 * Daily-average traffic, not a cumulative total — the SO wants "what does a typical recent day
 * look like", not an ever-growing sum since the transaction log started. Averages over whatever
 * of the last `days` (default 7) days are actually on file (so a fresh upload with only 3 days on
 * file still shows a real 3-day average rather than diluting by phantom zero-days).
 */
export function vehicleTypeAverages(outletId: string, days = 7): { perDay: Record<VehicleType, VehicleTypeCount>; daysAveraged: number } {
  const daysAveraged = trafficForOutlet(outletId, days).length;
  const totals = vehicleTypeTotals(outletId, days);
  const perDay = Object.fromEntries(
    (Object.keys(totals) as VehicleType[]).map((vt) => [vt, divideCount(totals[vt], daysAveraged || 1)]),
  ) as Record<VehicleType, VehicleTypeCount>;
  return { perDay, daysAveraged };
}

/** Same daily-average treatment as vehicleTypeAverages, for the per-product (MS/HSD/...) breakdown. */
export function productAverages(outletId: string, days = 7): { perDay: Record<string, VehicleTypeCount>; daysAveraged: number } {
  const daysAveraged = trafficForOutlet(outletId, days).length;
  const totals = productTotals(outletId, days);
  const perDay = Object.fromEntries(Object.entries(totals).map(([k, c]) => [k, divideCount(c, daysAveraged || 1)]));
  return { perDay, daysAveraged };
}

export function peakHour(outletId: string, days?: number): { hour: number; transactions: number } | null {
  const hourly = new Array(24).fill(0);
  let any = false;
  for (const day of trafficForOutlet(outletId, days)) {
    any = true;
    for (let h = 0; h < 24; h++) hourly[h] += day.hourlyTransactionCounts[h] ?? 0;
  }
  if (!any) return null;
  const hour = hourly.indexOf(Math.max(...hourly));
  return { hour, transactions: hourly[hour] };
}

export function hourlyDistribution(outletId: string, days?: number): number[] {
  const hourly = new Array(24).fill(0);
  for (const day of trafficForOutlet(outletId, days)) {
    for (let h = 0; h < 24; h++) hourly[h] += day.hourlyTransactionCounts[h] ?? 0;
  }
  return hourly;
}

export function nozzleStatusForOutlet(outletId: string): NozzleActivity[] {
  return store.nozzleActivity.filter((n) => n.outletId === outletId);
}

/** Outlets with at least one DU that's gone quiet while its siblings keep transacting. */
export function outletsWithInactiveNozzles(): { outletId: string; nozzles: NozzleActivity[] }[] {
  const byOutlet = new Map<string, NozzleActivity[]>();
  for (const n of store.nozzleActivity) {
    if (!n.possiblyInactive) continue;
    const list = byOutlet.get(n.outletId) ?? [];
    list.push(n);
    byOutlet.set(n.outletId, list);
  }
  return [...byOutlet.entries()].map(([outletId, nozzles]) => ({ outletId, nozzles }));
}
