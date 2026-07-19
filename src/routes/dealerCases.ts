import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import * as wf from "../services/dealerWorkflow.js";
import { generateSimplePdf } from "../services/pdfGen.js";

async function wrap<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof wf.WorkflowError) throw new ApiError(409, err.message);
    throw err;
  }
}

export function registerDealerCaseRoutes(router: Router) {
  router.get("/api/cases", (_req, res) => {
    sendJson(res, 200, wf.listCases());
  });

  router.get("/api/cases/:id", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.getCaseById(params["id"]!)));
  });

  router.get("/api/cases/stuck-milestones", (_req, res) => {
    sendJson(res, 200, wf.stuckMilestones());
  });

  router.post("/api/cases", async (req, res) => {
    const body = await readJsonBody<{
      salesArea: string;
      stretchName: string;
      kmlFileName?: string;
      competitorContext: string;
      caseType?: "NewSiteDevelopment" | "Resitement";
      existingOutletId?: string;
      groundsSelected?: string[];
      dealerRequestText?: string;
    }>(req);
    if (!body.salesArea || !body.stretchName || !body.competitorContext) {
      throw new ApiError(400, "salesArea, stretchName and competitorContext are required");
    }
    sendJson(res, 201, await wrap(() => wf.createCase(body)));
  });

  router.post("/api/cases/:id/roster", async (req, res, params) => {
    const body = await readJsonBody<{ entries: Parameters<typeof wf.setRoster>[1] }>(req);
    sendJson(res, 200, await wrap(() => wf.setRoster(params["id"]!, body.entries ?? [])));
  });

  router.post("/api/cases/:id/feasibility", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.generateFeasibilityReport(params["id"]!)));
  });

  // Resitement-only: technical evaluation committee.
  router.post("/api/cases/:id/resitement/committee", async (req, res, params) => {
    const body = await readJsonBody<{ name: string; designation: string }>(req);
    if (!body.name || !body.designation) throw new ApiError(400, "name and designation are required");
    sendJson(res, 200, await wrap(() => wf.addResitementCommitteeMember(params["id"]!, body.name, body.designation)));
  });

  router.post("/api/cases/:id/resitement/technical-evaluation", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.generateTechnicalEvaluationReport(params["id"]!)));
  });

  router.post("/api/cases/:id/application", async (req, res, params) => {
    const body = await readJsonBody<Parameters<typeof wf.submitApplication>[1]>(req);
    sendJson(res, 200, await wrap(() => wf.submitApplication(params["id"]!, body)));
  });

  // Best-effort field extraction from an uploaded Application Form (text-based only — no OCR
  // service is reachable from this environment). Persists the upload + extraction result on the
  // case itself (so an FVC officer/auditor can see it later, even after reload) and returns
  // suggested field values for the SO to review. Does not submit the ApplicationForm — actual
  // submission still goes through POST /api/cases/:id/application above.
  router.post("/api/cases/:id/application/extract", async (req, res, params) => {
    const body = await readJsonBody<{ text: string; fileName?: string }>(req);
    const { extraction } = await wrap(() => wf.recordApplicationFormUpload(params["id"]!, body.fileName ?? "upload.txt", body.text ?? ""));
    sendJson(res, 200, extraction);
  });

  router.post("/api/cases/:id/inspections/asc", async (req, res, params) => {
    const body = await readJsonBody<{
      itemAnswers: Parameters<typeof wf.submitAsc>[1];
      rectifiableDeficiencies?: string[];
      nonRectifiableDeficiencies?: string[];
      recommendation: Parameters<typeof wf.submitAsc>[4];
      member1: string;
      member2: string;
    }>(req);
    if (!body.recommendation || !body.member1 || !body.member2) {
      throw new ApiError(400, "recommendation, member1 and member2 are required");
    }
    sendJson(
      res,
      200,
      await wrap(() =>
        wf.submitAsc(
          params["id"]!,
          body.itemAnswers ?? {},
          body.rectifiableDeficiencies ?? [],
          body.nonRectifiableDeficiencies ?? [],
          body.recommendation,
          body.member1,
          body.member2,
        ),
      ),
    );
  });

  router.post("/api/cases/:id/inspections/lec", async (req, res, params) => {
    const body = await readJsonBody<{
      evaluationAnswers: Parameters<typeof wf.submitLec>[1];
      siteFields: Parameters<typeof wf.submitLec>[2];
      layoutMatchesApplication: Parameters<typeof wf.submitLec>[3];
      layoutDeviationNotes?: string;
      recommendationSuitable: Parameters<typeof wf.submitLec>[5];
      reasonsIfNotSuitable?: string[];
      member1: string;
      member2: string;
      member3?: string;
    }>(req);
    if (!body.recommendationSuitable || !body.member1 || !body.member2) {
      throw new ApiError(400, "recommendationSuitable, member1 and member2 are required");
    }
    sendJson(
      res,
      200,
      await wrap(() =>
        wf.submitLec(
          params["id"]!,
          body.evaluationAnswers ?? {},
          body.siteFields ?? { distanceFromLandmarkM: "", landmarkName: "", distanceEdgeFromCenterLineM: "", rowWidthM: "", roadNameOrNo: "", latLong: "" },
          body.layoutMatchesApplication ?? "",
          body.layoutDeviationNotes ?? "",
          body.recommendationSuitable,
          body.reasonsIfNotSuitable ?? [],
          body.member1,
          body.member2,
          body.member3 ?? "",
        ),
      ),
    );
  });

  router.post("/api/cases/:id/inspections/fvc", async (req, res, params) => {
    const body = await readJsonBody<{
      itemAnswers: Parameters<typeof wf.submitFvc>[1];
      anyOtherRemarks?: string;
      member1: string;
      member2: string;
    }>(req);
    if (!body.member1 || !body.member2) throw new ApiError(400, "member1 and member2 are required");
    sendJson(
      res,
      200,
      await wrap(() => wf.submitFvc(params["id"]!, body.itemAnswers ?? {}, body.anyOtherRemarks ?? "", body.member1, body.member2)),
    );
  });

  router.post("/api/cases/:id/file-note", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.generateFileNote(params["id"]!)));
  });

  router.post("/api/cases/:id/file-note/decision", async (req, res, params) => {
    const body = await readJsonBody<{ approve: boolean; approvedBy: string; actorTitle?: string; remarks?: string }>(req);
    sendJson(
      res,
      200,
      await wrap(() => wf.decideFileNote(params["id"]!, !!body.approve, body.approvedBy ?? "Approver", body.actorTitle ?? "Approving Authority", body.remarks)),
    );
  });

  router.post("/api/cases/:id/loi", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.generateLOI(params["id"]!)));
  });

  router.get("/api/cases/:id/loi.pdf", async (_req, res, params) => {
    const c = await wrap(() => wf.getCaseById(params["id"]!));
    if (!c.loi) throw new ApiError(404, "LOI not generated yet");
    const pdf = generateSimplePdf(`Intimation Letter — ${c.stretchName}`, c.loi.text.split("\n"));
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${c.id}_intimation_letter.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  router.get("/api/cases/:id/lease.pdf", async (_req, res, params) => {
    const c = await wrap(() => wf.getCaseById(params["id"]!));
    if (!c.leaseAgreement) throw new ApiError(404, "Lease agreement not generated yet (auto-generates on NOC receipt)");
    const pdf = generateSimplePdf(`Lease Deed — ${c.stretchName}`, c.leaseAgreement.text.split("\n"));
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${c.id}_lease_deed.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  router.get("/api/cases/:id/dealership-agreement.pdf", async (_req, res, params) => {
    const c = await wrap(() => wf.getCaseById(params["id"]!));
    if (!c.dealershipAgreement) throw new ApiError(404, "Dealership agreement not generated yet (auto-generates on NOC receipt)");
    const pdf = generateSimplePdf(`Dealership Agreement — ${c.stretchName}`, c.dealershipAgreement.text.split("\n"));
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${c.id}_dealership_agreement.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  router.post("/api/cases/:id/milestones/:key", async (req, res, params) => {
    const body = await readJsonBody<{ status: Parameters<typeof wf.updateMilestone>[2]; notes?: string; departments?: string[] }>(req);
    sendJson(
      res,
      200,
      await wrap(() => wf.updateMilestone(params["id"]!, params["key"] as never, body.status, body.notes, body.departments)),
    );
  });

  router.post("/api/cases/:id/customer-master-sync", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.syncCustomerMaster(params["id"]!)));
  });

  router.post("/api/cases/:id/budget", async (req, res, params) => {
    const body = await readJsonBody<{ costEstimate: number; irr: number }>(req);
    if (typeof body.costEstimate !== "number" || typeof body.irr !== "number") {
      throw new ApiError(400, "costEstimate and irr (numbers) are required");
    }
    sendJson(res, 200, await wrap(() => wf.generateBudget(params["id"]!, body.costEstimate, body.irr)));
  });

  router.post("/api/cases/:id/budget/decision", async (req, res, params) => {
    const body = await readJsonBody<{ approve: boolean }>(req);
    sendJson(res, 200, await wrap(() => wf.decideBudget(params["id"]!, !!body.approve)));
  });

  router.post("/api/cases/:id/commission", async (_req, res, params) => {
    sendJson(res, 200, await wrap(() => wf.commissionCase(params["id"]!)));
  });
}
