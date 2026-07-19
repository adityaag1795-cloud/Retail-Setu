import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { dailySummary, askAnalytics } from "../services/predictive.js";

export function registerAnalyticsRoutes(router: Router) {
  router.get("/api/analytics/summary", (_req, res) => {
    sendJson(res, 200, dailySummary());
  });

  router.post("/api/analytics/ask", async (req, res) => {
    const body = await readJsonBody<{ question: string }>(req);
    if (!body.question) throw new ApiError(400, "question is required");
    sendJson(res, 200, await askAnalytics(body.question));
  });
}
