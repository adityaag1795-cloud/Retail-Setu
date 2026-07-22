import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { store } from "../store.js";
import { askPolicyBot } from "../services/policyBot.js";

export function registerKnowledgeRoutes(router: Router) {
  router.get("/api/policy-clauses", (_req, res) => {
    sendJson(res, 200, [...store.policyClauses.values()]);
  });

  router.post("/api/knowledge/ask", async (req, res) => {
    const body = await readJsonBody<{ question: string }>(req);
    if (!body.question) throw new ApiError(400, "question is required");
    sendJson(res, 200, await askPolicyBot(body.question));
  });
}
