import type { Router } from "../httpUtil.js";
import { sendJson, ApiError } from "../httpUtil.js";
import { store } from "../store.js";

export function registerTradingAreaRoutes(router: Router) {
  router.get("/api/trading-areas", (_req, res) => {
    sendJson(
      res,
      200,
      [...store.tradingAreas.values()].map((t) => ({ id: t.id, name: t.name, month: t.month, dealerCount: t.dealers.length })),
    );
  });

  // One-page snapshot: the real competitive dealer-wise report + only our own outlets that are
  // underperforming this trading area's average TMF volume (see averageTmfVolumeKL below) —
  // the outlets an SO actually needs to act on, not the full roster.
  router.get("/api/trading-areas/:id", (_req, res, params) => {
    const snapshot = store.tradingAreas.get(params["id"]!);
    if (!snapshot) throw new ApiError(404, `Trading area ${params["id"]} not found`);

    // Average over dealers with a real reported TMF volume only — a dealer with no figure on
    // file (see TradingAreaDealerFigures) is left out of the average rather than counted as 0,
    // which would silently drag the average down and misclassify genuine performers as "below".
    const reportedVolumes = snapshot.dealers.map((d) => d.tmfVolumeKL).filter((v): v is number => v != null);
    const averageTmfVolumeKL = reportedVolumes.length
      ? reportedVolumes.reduce((sum, v) => sum + v, 0) / reportedVolumes.length
      : null;

    // Deliberately every outlet of ours here, not just the prototype's curated/visible set — this
    // is a real competitive-risk signal (an outlet genuinely losing share in its own catchment),
    // and hiding a real underperformer just because it's outside the demo's curated 11 would
    // suppress exactly the finding this feature exists to surface.
    const dealerByOutletId = new Map(snapshot.dealers.filter((d) => d.outletId).map((d) => [d.outletId!, d]));
    const outlets = [...store.outlets.values()]
      .filter((o) => o.tradingAreaId === snapshot.id)
      .map((o) => ({ ...o, tmfVolumeKL: dealerByOutletId.get(o.id)?.tmfVolumeKL }))
      // Only outlets with a real reported volume that is actually below the average — an outlet
      // with no figure on file can't be judged either way, so it's excluded rather than assumed
      // underperforming.
      .filter((o) => o.tmfVolumeKL != null && averageTmfVolumeKL != null && o.tmfVolumeKL < averageTmfVolumeKL);

    sendJson(res, 200, { ...snapshot, averageTmfVolumeKL, outlets });
  });
}
