import type {
  AgeBracket,
  ClassOfMarket,
  DeltaTotals,
  GroupSummary,
  PAOutletWithAge,
  Region,
  RegionSummary,
  SalesAreaSummary,
  Zone,
  ZoneSummary,
} from "./types.js";
import { AGE_BRACKETS } from "./types.js";

function emptyTotals(): DeltaTotals {
  return {
    outletCount: 0,
    msKl2526: 0,
    hsdKl2526: 0,
    msKl2627: 0,
    hsdKl2627: 0,
    msDeltaKlpm: 0,
    hsdDeltaKlpm: 0,
    avgMsDeltaKlpm: 0,
    avgHsdDeltaKlpm: 0,
  };
}

function accumulate(totals: DeltaTotals, o: PAOutletWithAge): void {
  totals.outletCount += 1;
  totals.msKl2526 += o.msKl2526;
  totals.hsdKl2526 += o.hsdKl2526;
  totals.msKl2627 += o.msKl2627;
  totals.hsdKl2627 += o.hsdKl2627;
  totals.msDeltaKlpm += o.msDeltaKlpm;
  totals.hsdDeltaKlpm += o.hsdDeltaKlpm;
}

function finalize(totals: DeltaTotals): DeltaTotals {
  const n = totals.outletCount || 1;
  return {
    ...totals,
    avgMsDeltaKlpm: Number((totals.msDeltaKlpm / n).toFixed(3)),
    avgHsdDeltaKlpm: Number((totals.hsdDeltaKlpm / n).toFixed(3)),
  };
}

function groupBy<T>(items: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Totals for `outlets`, broken down by Class of Market and by age bracket. */
export function summarize(key: string, outlets: PAOutletWithAge[]): GroupSummary {
  const totals = emptyTotals();
  const byClass = new Map<ClassOfMarket, DeltaTotals>();
  const byAge = new Map<AgeBracket, DeltaTotals>();

  for (const o of outlets) {
    accumulate(totals, o);

    const c = byClass.get(o.classOfMarket) ?? emptyTotals();
    accumulate(c, o);
    byClass.set(o.classOfMarket, c);

    const a = byAge.get(o.ageBracket) ?? emptyTotals();
    accumulate(a, o);
    byAge.set(o.ageBracket, a);
  }

  const byClassOfMarket: Partial<Record<ClassOfMarket, DeltaTotals>> = {};
  for (const [k, v] of byClass) byClassOfMarket[k] = finalize(v);

  const byAgeBracket: Partial<Record<AgeBracket, DeltaTotals>> = {};
  for (const bracket of AGE_BRACKETS) {
    const v = byAge.get(bracket);
    if (v) byAgeBracket[bracket] = finalize(v);
  }

  return { key, ...finalize(totals), byClassOfMarket, byAgeBracket };
}

export function summarizeByZone(outlets: PAOutletWithAge[]): ZoneSummary[] {
  const groups = groupBy(outlets, (o) => o.zone);
  return [...groups.values()]
    .map((rows) => {
      const zone = rows[0]!.zone;
      return { zone, ...summarize(zone, rows) };
    })
    .sort((a, b) => b.outletCount - a.outletCount);
}

/** Region-level summary, optionally scoped to a single zone. */
export function summarizeByRegion(outlets: PAOutletWithAge[], zone?: Zone): RegionSummary[] {
  const scoped = zone ? outlets.filter((o) => o.zone === zone) : outlets;
  const groups = groupBy(scoped, (o) => `${o.zone}${o.region}`);
  return [...groups.values()]
    .map((rows) => {
      const { zone: z, region } = rows[0]!;
      return { zone: z, region, ...summarize(region, rows) };
    })
    .sort((a, b) => b.outletCount - a.outletCount);
}

/** Sales-area-level summary, optionally scoped to a single region. */
export function summarizeBySalesArea(outlets: PAOutletWithAge[], region?: Region): SalesAreaSummary[] {
  const scoped = region ? outlets.filter((o) => o.region === region) : outlets;
  const groups = groupBy(scoped, (o) => `${o.zone}${o.region}${o.salesArea}`);
  return [...groups.values()]
    .map((rows) => {
      const { zone, region: r, salesArea } = rows[0]!;
      return { zone, region: r, salesArea, ...summarize(salesArea, rows) };
    })
    .sort((a, b) => b.outletCount - a.outletCount);
}

/** All-India totals, broken down the same way as a single zone/region/sales-area summary. */
export function summarizeAll(outlets: PAOutletWithAge[]): GroupSummary {
  return summarize("All India", outlets);
}

/** National Class-of-Market x age-bracket cross-tab — the two dimensions the model cross-cuts every geography by. */
export function crossTabClassByAge(
  outlets: PAOutletWithAge[],
): Partial<Record<ClassOfMarket, Partial<Record<AgeBracket, DeltaTotals>>>> {
  const byClass = groupBy(outlets, (o) => o.classOfMarket);
  const out: Partial<Record<ClassOfMarket, Partial<Record<AgeBracket, DeltaTotals>>>> = {};
  for (const [classOfMarket, rows] of byClass) {
    const byAge = groupBy(rows, (o) => o.ageBracket);
    const ageRow: Partial<Record<AgeBracket, DeltaTotals>> = {};
    for (const bracket of AGE_BRACKETS) {
      const bucket = byAge.get(bracket);
      if (!bucket) continue;
      const totals = emptyTotals();
      for (const o of bucket) accumulate(totals, o);
      ageRow[bracket] = finalize(totals);
    }
    out[classOfMarket as ClassOfMarket] = ageRow;
  }
  return out;
}
