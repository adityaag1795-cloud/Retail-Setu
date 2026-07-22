/**
 * Real "below trading-area average" — an outlet's own real dealer-wise competitive TMF volume
 * (see TradingAreaSnapshot, HPCL's own Market Share report) compared against the real average
 * across every OMC's outlet sharing that same catchment. This is NOT the same thing as
 * Outlet.taAverageKL (a separate, static per-outlet benchmark figure that isn't computed from real
 * trading-area peers) — using that field here previously misclassified outlets: an outlet can be
 * the highest seller in its own trading area and still show "below" a stale, unrelated benchmark
 * number. Only covers outlets with a real tradingAreaId assignment (see seedTradingAreas) — every
 * other outlet is left out rather than guessed.
 */
import { store } from "../store.js";
import type { Outlet, TradingAreaSnapshot } from "../types.js";

export interface TradingAreaBelowAverageRow {
  outlet: Outlet;
  tmfVolumeKL: number;
  tradingAreaAverageKL: number;
  tradingAreaName: string;
  pctOfAverage: number; // 0-100, e.g. 44 means running at 44% of the trading area's real average
}

// Average over dealers with a real reported TMF volume only — a dealer with no figure on file
// (a handful genuinely report nothing all year) is left out rather than counted as 0, which would
// silently drag the average down.
function averageTmfVolumeKL(snapshot: TradingAreaSnapshot): number | null {
  const vols = snapshot.dealers.map((d) => d.tmfVolumeKL).filter((v): v is number => v != null);
  return vols.length ? vols.reduce((sum, v) => sum + v, 0) / vols.length : null;
}

/** Every one of our outlets genuinely below its own trading area's real average, worst first. */
export function outletsBelowTradingAreaAverage(): TradingAreaBelowAverageRow[] {
  const rows: TradingAreaBelowAverageRow[] = [];
  for (const snapshot of store.tradingAreas.values()) {
    const avg = averageTmfVolumeKL(snapshot);
    if (avg == null) continue;
    for (const d of snapshot.dealers) {
      if (!d.outletId || d.tmfVolumeKL == null || d.tmfVolumeKL >= avg) continue;
      const outlet = store.outlets.get(d.outletId);
      if (!outlet) continue;
      rows.push({
        outlet,
        tmfVolumeKL: d.tmfVolumeKL,
        tradingAreaAverageKL: Math.round(avg * 10) / 10,
        tradingAreaName: snapshot.name,
        pctOfAverage: Math.round((d.tmfVolumeKL / avg) * 1000) / 10,
      });
    }
  }
  return rows.sort((a, b) => a.pctOfAverage - b.pctOfAverage);
}
