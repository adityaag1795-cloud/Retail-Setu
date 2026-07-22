import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { dailySummary, askAnalytics, syncPredictiveAlerts } from "../services/predictive.js";
import { salesAreaSummary } from "../services/kpiTracker.js";
import { outletVolumeGrowth, PARTIAL_MONTH_CAVEAT } from "../services/growthAnalysis.js";

export function registerAnalyticsRoutes(router: Router) {
  router.get("/api/analytics/summary", (_req, res) => {
    syncPredictiveAlerts();
    sendJson(res, 200, dailySummary());
  });

  // Sales Area Summary — current month + year-to-date real actuals per product; ?outletId=
  // scopes to one outlet, omit for the whole sales area combined.
  router.get("/api/analytics/sales-area-summary", (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const outletId = url.searchParams.get("outletId") ?? undefined;
    sendJson(res, 200, salesAreaSummary(outletId));
  });

  // Per-outlet MS/HSD/Power growth or degrowth (latest real CY month vs last year), paired with
  // real DU transaction-log signals (slab-mix trend, uptime) where a log exists for that outlet.
  router.get("/api/analytics/growth", (_req, res) => {
    sendJson(res, 200, { caveat: PARTIAL_MONTH_CAVEAT, reports: outletVolumeGrowth() });
  });

  router.post("/api/analytics/ask", async (req, res) => {
    const body = await readJsonBody<{ question: string }>(req);
    if (!body.question) throw new ApiError(400, "question is required");
    sendJson(res, 200, await askAnalytics(body.question));
  });
}
