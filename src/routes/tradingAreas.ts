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

  // One-page snapshot: the real competitive dealer-wise report + every one of our own outlets
  // tagged with this trading area, together on one page.
  router.get("/api/trading-areas/:id", (_req, res, params) => {
    const snapshot = store.tradingAreas.get(params["id"]!);
    if (!snapshot) throw new ApiError(404, `Trading area ${params["id"]} not found`);
    const outlets = [...store.outlets.values()].filter((o) => o.tradingAreaId === snapshot.id);
    sendJson(res, 200, { ...snapshot, outlets });
  });
}
