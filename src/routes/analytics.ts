import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { dailySummary, askAnalytics, syncPredictiveAlerts } from "../services/predictive.js";
import { salesAreaSummary } from "../services/kpiTracker.js";

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

  router.post("/api/analytics/ask", async (req, res) => {
    const body = await readJsonBody<{ question: string }>(req);
    if (!body.question) throw new ApiError(400, "question is required");
    sendJson(res, 200, await askAnalytics(body.question));
  });
}
