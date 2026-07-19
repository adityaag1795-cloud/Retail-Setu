import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import * as dd from "../services/dealerDesk.js";

async function wrap<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof dd.DealerDeskError) throw new ApiError(409, err.message);
    throw err;
  }
}

export function registerDealerDeskRoutes(router: Router) {
  router.get("/api/dealer-requests", (_req, res) => {
    sendJson(res, 200, dd.listDealerRequests());
  });

  router.get("/api/dealer-requests/critical", (_req, res) => {
    sendJson(res, 200, dd.criticalOpenRequests());
  });

  router.get("/api/dealer-requests/:id", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => dd.getDealerRequest(params["id"]!)));
  });

  router.post("/api/dealer-requests", async (req, res) => {
    const body = await readJsonBody<Parameters<typeof dd.raiseDealerRequest>[0]>(req);
    if (!body.outletId || !body.category || !body.subject || !body.description) {
      throw new ApiError(400, "outletId, category, subject and description are required");
    }
    sendJson(res, 201, await wrap(() => dd.raiseDealerRequest(body)));
  });

  router.post("/api/dealer-requests/:id/followup", async (req, res, params) => {
    const body = await readJsonBody<{ text: string }>(req);
    if (!body.text) throw new ApiError(400, "text is required");
    sendJson(res, 200, await wrap(() => dd.addDealerFollowup(params["id"]!, body.text)));
  });

  router.post("/api/dealer-requests/:id/respond", async (req, res, params) => {
    const body = await readJsonBody<{ responderName: string; text: string; status?: Parameters<typeof dd.addSoResponse>[3] }>(req);
    if (!body.responderName || !body.text) throw new ApiError(400, "responderName and text are required");
    sendJson(res, 200, await wrap(() => dd.addSoResponse(params["id"]!, body.responderName, body.text, body.status)));
  });

  router.post("/api/dealer-requests/:id/escalate", async (req, res, params) => {
    const body = await readJsonBody<{ escalatedBy: string; reason: string }>(req);
    if (!body.escalatedBy || !body.reason) throw new ApiError(400, "escalatedBy and reason are required");
    sendJson(res, 200, await wrap(() => dd.escalateRequest(params["id"]!, body.escalatedBy, body.reason)));
  });

  router.post("/api/dealer-requests/:id/resolve", async (req, res, params) => {
    const body = await readJsonBody<{ resolvedBy: string; resolutionSummary: string }>(req);
    if (!body.resolvedBy || !body.resolutionSummary) throw new ApiError(400, "resolvedBy and resolutionSummary are required");
    sendJson(res, 200, await wrap(() => dd.resolveRequest(params["id"]!, body.resolvedBy, body.resolutionSummary)));
  });
}
