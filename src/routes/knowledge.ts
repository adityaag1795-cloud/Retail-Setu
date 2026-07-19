import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { store, nextId } from "../store.js";
import type { PolicyClause } from "../types.js";
import { askPolicyBot } from "../services/policyBot.js";

export function registerKnowledgeRoutes(router: Router) {
  router.get("/api/policy-clauses", (_req, res) => {
    sendJson(res, 200, [...store.policyClauses.values()]);
  });

  router.post("/api/policy-clauses", async (req, res) => {
    const body = await readJsonBody<Partial<PolicyClause>>(req);
    if (!body.documentTitle || !body.heading || !body.text) {
      throw new ApiError(400, "documentTitle, heading and text are required");
    }
    const clause: PolicyClause = {
      id: nextId("POL"),
      documentTitle: body.documentTitle,
      clauseNumber: body.clauseNumber ?? "N/A",
      heading: body.heading,
      text: body.text,
      tags: body.tags ?? [],
    };
    store.policyClauses.set(clause.id, clause);
    sendJson(res, 201, clause);
  });

  router.post("/api/knowledge/ask", async (req, res) => {
    const body = await readJsonBody<{ question: string }>(req);
    if (!body.question) throw new ApiError(400, "question is required");
    sendJson(res, 200, await askPolicyBot(body.question));
  });
}
