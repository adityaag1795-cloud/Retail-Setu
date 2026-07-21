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
import type { DailyTrafficSummary, NozzleActivity, SlabMonthlyRow, VehicleType, VehicleTypeCount } from "../types.js";
import { store } from "../store.js";

const VEHICLE_TYPES: VehicleType[] = ["TwoWheeler", "FourWheeler", "HMV", "BowserSupply"];

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

/**
 * Real transaction-amount "slab" (vehicle-type) volumes grouped by calendar month, over the
 * outlet's whole transaction-log window (not just the last-7-day average used elsewhere) — lets
 * the SO see how the mix of Two-Wheeler/Four-Wheeler/HMV/Bowser traffic has actually moved month
 * to month. Each row carries both the month's totals and a per-day average, since the most recent
 * month on file is very likely partial and a raw total would understate it next to a full month.
 */
export function monthlySlabTrend(outletId: string): SlabMonthlyRow[] {
  const byMonth = new Map<string, DailyTrafficSummary[]>();
  for (const day of trafficForOutlet(outletId)) {
    const month = day.date.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(day);
    byMonth.set(month, list);
  }
  const rows: SlabMonthlyRow[] = [];
  for (const month of [...byMonth.keys()].sort()) {
    const days = byMonth.get(month)!;
    const totals: Record<VehicleType, VehicleTypeCount> = {
      TwoWheeler: emptyCount(),
      FourWheeler: emptyCount(),
      HMV: emptyCount(),
      BowserSupply: emptyCount(),
    };
    for (const day of days) {
      for (const vt of VEHICLE_TYPES) {
        totals[vt].transactions += day.byVehicleType[vt].transactions;
        totals[vt].volumeKL += day.byVehicleType[vt].volumeKL;
        totals[vt].amountRs += day.byVehicleType[vt].amountRs;
      }
    }
    const avgPerDay = Object.fromEntries(VEHICLE_TYPES.map((vt) => [vt, divideCount(totals[vt], days.length)])) as Record<
      VehicleType,
      VehicleTypeCount
    >;
    rows.push({ month, daysOnFile: days.length, totals, avgPerDay });
  }
  return rows;
}

/**
 * Real gaps in the transaction log — calendar dates within the outlet's overall on-file window
 * with zero recorded transactions at all (not just a quiet vehicle-type slab). A run of 2+
 * consecutive missing days is flagged; this is exactly the kind of thing a monthly slab average
 * can hide (it just shows as a lower days-on-file count for that month) but matters to a
 * management reviewer — it usually means a genuine outlet closure or a RELCON/DU feed outage.
 */
export function transactionLogGaps(outletId: string): { startDate: string; endDate: string; days: number }[] {
  const rows = trafficForOutlet(outletId);
  if (rows.length === 0) return [];
  const onFile = new Set(rows.map((r) => r.date));
  const minDate = rows[0]!.date;
  const maxDate = rows[rows.length - 1]!.date;

  const gaps: { startDate: string; endDate: string; days: number }[] = [];
  let gapStart: string | null = null;
  const cursor = new Date(minDate + "T00:00:00Z");
  const end = new Date(maxDate + "T00:00:00Z");
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (!onFile.has(dateStr)) {
      if (gapStart === null) gapStart = dateStr;
    } else if (gapStart !== null) {
      const prev = new Date(cursor);
      prev.setUTCDate(prev.getUTCDate() - 1);
      const gapEnd = prev.toISOString().slice(0, 10);
      const days = Math.round((new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000) + 1;
      if (days >= 2) gaps.push({ startDate: gapStart, endDate: gapEnd, days });
      gapStart = null;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (gapStart !== null) {
    const days = Math.round((new Date(maxDate).getTime() - new Date(gapStart).getTime()) / 86400000) + 1;
    if (days >= 2) gaps.push({ startDate: gapStart, endDate: maxDate, days });
  }
  return gaps;
}

/**
 * Rule-based (not AI-narrated) read on the monthly slab trend: for each vehicle type, compares
 * the earliest and latest month's daily average transaction count and states the real % change,
 * plus flags the single largest month-over-month swing. Every number here traces directly back
 * to monthlySlabTrend — nothing is inferred or projected. Also leads with any multi-day gaps
 * where the transaction log has zero activity at all, since those matter more than a slab's
 * own trend and would otherwise just look like a lower days-on-file count for that month.
 */
export function slabTrendNarrative(outletId: string): string[] {
  const rows = monthlySlabTrend(outletId);
  if (rows.length < 2) {
    return ["Not enough months of real transaction data on file yet to assess a month-over-month trend."];
  }
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const lines: string[] = [];
  for (const gap of transactionLogGaps(outletId)) {
    lines.push(
      `⚠ No transactions recorded from ${gap.startDate} to ${gap.endDate} (${gap.days} days) — verify whether this reflects a genuine outlet closure/DU outage or a gap in the transaction feed.`,
    );
  }
  for (const vt of VEHICLE_TYPES) {
    const firstAvg = first.avgPerDay[vt].transactions;
    const lastAvg = last.avgPerDay[vt].transactions;
    if (firstAvg === 0 && lastAvg === 0) continue;

    let largestSwing: { month: string; pct: number } | null = null;
    for (let i = 1; i < rows.length; i++) {
      const prevAvg = rows[i - 1]!.avgPerDay[vt].transactions;
      const curAvg = rows[i]!.avgPerDay[vt].transactions;
      if (prevAvg <= 0) continue;
      const pct = ((curAvg - prevAvg) / prevAvg) * 100;
      if (largestSwing === null || Math.abs(pct) > Math.abs(largestSwing.pct)) {
        largestSwing = { month: rows[i]!.month, pct };
      }
    }

    const overallPct = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : null;
    const direction = lastAvg > firstAvg ? "up" : lastAvg < firstAvg ? "down" : "flat";
    const overallText =
      overallPct === null
        ? `from 0/day in ${first.month} to ${lastAvg.toFixed(1)}/day in ${last.month}`
        : `${direction} ${Math.abs(overallPct).toFixed(0)}% — from ${firstAvg.toFixed(1)}/day in ${first.month} to ${lastAvg.toFixed(1)}/day in ${last.month}`;
    const swingText =
      largestSwing && Math.abs(largestSwing.pct) >= 15
        ? ` Largest single-month move: ${largestSwing.pct >= 0 ? "+" : ""}${largestSwing.pct.toFixed(0)}% in ${largestSwing.month}.`
        : "";
    lines.push(`${VEHICLE_TYPE_LABELS[vt]}: daily average transactions ${overallText}.${swingText}`);
  }
  return lines;
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
