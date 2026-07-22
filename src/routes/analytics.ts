import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { dailySummary, askAnalytics, syncPredictiveAlerts } from "../services/predictive.js";
import { salesAreaSummary } from "../services/kpiTracker.js";
import { stockVsSalesInsights, suddenSalesMoves, dryRiskWithoutCover } from "../services/predictiveInsights.js";
import { PARTIAL_MONTH_CAVEAT } from "../services/growthAnalysis.js";

const SUDDEN_MOVES_DISPLAY_LIMIT = 5;

export function registerAnalyticsRoutes(router: Router) {
  router.get("/api/analytics/summary", (_req, res) => {
    syncPredictiveAlerts();
    sendJson(res, 200, dailySummary());
  });

  // Real cross-signal insights (sales trend x stock level) — see predictiveInsights.ts. Sudden
  // moves list keeps an honest total count but caps each direction's displayed list for readability.
  router.get("/api/analytics/predictive-insights", (_req, res) => {
    const moves = suddenSalesMoves();
    const up = moves.filter((m) => m.direction === "up");
    const down = moves.filter((m) => m.direction === "down");
    sendJson(res, 200, {
      partialMonthCaveat: PARTIAL_MONTH_CAVEAT,
      stockVsSales: stockVsSalesInsights(),
      dryRiskWithoutCover: dryRiskWithoutCover(),
      suddenMoves: {
        totalCount: moves.length,
        up: up.slice(0, SUDDEN_MOVES_DISPLAY_LIMIT),
        upTotalCount: up.length,
        down: down.slice(0, SUDDEN_MOVES_DISPLAY_LIMIT),
        downTotalCount: down.length,
      },
    });
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
