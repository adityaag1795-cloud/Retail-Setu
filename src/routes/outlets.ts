import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { store, nextId } from "../store.js";
import type { Communication } from "../types.js";
import { generateSimplePdf } from "../services/pdfGen.js";
import { monthlyKL, dryDayCount, outletTankStock } from "../services/predictive.js";
import { requestsForOutlet } from "../services/dealerDesk.js";
import * as wf from "../services/dealerWorkflow.js";

function outletOrThrow(id: string) {
  const o = store.outlets.get(id);
  if (!o) throw new ApiError(404, `Outlet ${id} not found`);
  return o;
}

async function wrap<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof wf.WorkflowError) throw new ApiError(409, err.message);
    throw err;
  }
}

function fixedAssetSummary(outlet: ReturnType<typeof outletOrThrow>) {
  return outlet.fixedAssets.reduce(
    (acc, a) => ({
      count: acc.count + 1,
      totalInvested: acc.totalInvested + a.grossBlock,
      totalDepreciation: acc.totalDepreciation + a.depreciationReserve,
      totalNetBookValue: acc.totalNetBookValue + a.netBookValue,
    }),
    { count: 0, totalInvested: 0, totalDepreciation: 0, totalNetBookValue: 0 },
  );
}

export function registerOutletRoutes(router: Router) {
  router.get("/api/outlets", (_req, res) => {
    sendJson(res, 200, [...store.outlets.values()]);
  });

  router.get("/api/outlets/:id", (_req, res, params) => {
    sendJson(res, 200, outletOrThrow(params["id"]!));
  });

  // Module 1 "one-pager" report — master sheet + fixed-asset TOTALS (not the line-item list — see the
  // dedicated Fixed Assets tab below for that) + comms + linked case + current sales snapshot.
  router.get("/api/outlets/:id/report", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const comms = [...store.communications.values()].filter((c) => c.outletId === outlet.id);
    const linkedCase = outlet.linkedCaseId ? store.dealerCases.get(outlet.linkedCaseId) : undefined;
    sendJson(res, 200, {
      outlet,
      masterSheetTable: Object.entries(outlet.masterSheet).map(([field, value]) => ({ field, value })),
      fixedAssetSummary: fixedAssetSummary(outlet),
      communications: comms,
      last30DaysKL: monthlyKL(outlet.id),
      dryDaysLast60: dryDayCount(outlet.id),
      tankStock: outletTankStock(outlet.id),
      dealerRequests: requestsForOutlet(outlet.id),
      canopyRequest: outlet.canopyRequest,
      linkedCase: linkedCase ? { id: linkedCase.id, stage: linkedCase.stage } : undefined,
    });
  });

  router.get("/api/outlets/:id/report.pdf", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const comms = [...store.communications.values()].filter((c) => c.outletId === outlet.id);
    const fa = fixedAssetSummary(outlet);
    const lines = [
      `Outlet: ${outlet.name} (${outlet.id})`,
      `Sales Area: ${outlet.salesArea} | District: ${outlet.district} | Status: ${outlet.status}`,
      `Dealer: ${outlet.dealerName ?? "-"}`,
      "",
      "Master Sheet:",
      ...Object.entries(outlet.masterSheet).map(([k, v]) => `  ${k}: ${v}`),
      "",
      `Fixed Assets: ${fa.count} item(s) — Total Invested (Gross Block) Rs. ${fa.totalInvested.toLocaleString("en-IN")}, Total Depreciation Rs. ${fa.totalDepreciation.toLocaleString("en-IN")}, Net Book Value Rs. ${fa.totalNetBookValue.toLocaleString("en-IN")}. See the Fixed Assets tab for the itemised SAP FAIL report.`,
      "",
      `Communications on file (${comms.length}):`,
      ...comms.map((c) => `  - [${c.date}] ${c.direction} ${c.channel}: ${c.subject}`),
      "",
      `30-day throughput: ${monthlyKL(outlet.id)} KL | Dry days (60-day): ${dryDayCount(outlet.id)}`,
    ];
    const pdf = generateSimplePdf(`Outlet One-Pager — ${outlet.name}`, lines);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${outlet.id}_one_pager.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  // Separate "tab" — the full itemised fixed-asset report (SAP FAIL format) for one outlet.
  router.get("/api/outlets/:id/fixed-assets", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    sendJson(res, 200, { outlet: { id: outlet.id, name: outlet.name }, fixedAssets: outlet.fixedAssets, summary: fixedAssetSummary(outlet) });
  });

  router.get("/api/outlets/:id/communications", (_req, res, params) => {
    outletOrThrow(params["id"]!);
    sendJson(
      res,
      200,
      [...store.communications.values()].filter((c) => c.outletId === params["id"]),
    );
  });

  router.post("/api/outlets/:id/communications", async (req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const body = await readJsonBody<Partial<Communication>>(req);
    if (!body.subject || !body.summary) throw new ApiError(400, "subject and summary are required");
    const comm: Communication = {
      id: nextId("COMM"),
      outletId: outlet.id,
      date: new Date().toISOString().slice(0, 10),
      direction: body.direction ?? "Inbound",
      channel: body.channel ?? "Email",
      subject: body.subject,
      summary: body.summary,
      pdfRecordName: `${outlet.id}_${nextId("REC")}.pdf`,
      scanCopy: body.scanCopy ?? false,
    };
    store.communications.set(comm.id, comm);
    sendJson(res, 201, comm);
  });

  router.get("/api/outlets/:id/communications/:commId/pdf", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const comm = store.communications.get(params["commId"]!);
    if (!comm || comm.outletId !== outlet.id) throw new ApiError(404, "Communication not found");
    const pdf = generateSimplePdf(`Communication Record — ${outlet.name}`, [
      `Date: ${comm.date}`,
      `Direction: ${comm.direction} | Channel: ${comm.channel} | Scan copy: ${comm.scanCopy ? "Yes" : "No"}`,
      `Subject: ${comm.subject}`,
      "",
      comm.summary,
    ]);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${comm.pdfRecordName}"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  // Canopy addition sub-workflow — available to any operational outlet, per the real
  // "request cum commitment proposal from portal" flow (not gated on a live Module 2 case).
  router.post("/api/outlets/:id/canopy-request", async (req, res, params) => {
    const body = await readJsonBody<{ committedVolumeKL: number; costEstimate: number; irr: number; dealerJustification: string }>(req);
    sendJson(
      res,
      200,
      await wrap(() => wf.requestCanopy(params["id"]!, body.committedVolumeKL, body.costEstimate, body.irr, body.dealerJustification)),
    );
  });

  router.post("/api/outlets/:id/canopy-request/decision", async (req, res, params) => {
    const body = await readJsonBody<{ decision: "Approved" | "Rejected"; justification: string; decidedBy: string }>(req);
    sendJson(res, 200, await wrap(() => wf.decideCanopyRequest(params["id"]!, body.decision, body.justification, body.decidedBy ?? "SO")));
  });

  router.post("/api/outlets/:id/canopy-request/eam", async (req, res, params) => {
    const body = await readJsonBody<{ approve: boolean }>(req);
    sendJson(res, 200, await wrap(() => wf.decideCanopyEAM(params["id"]!, !!body.approve)));
  });

  router.post("/api/outlets/:id/canopy-request/weekly-check", async (req, res, params) => {
    const body = await readJsonBody<{ actualKL: number }>(req);
    sendJson(res, 200, await wrap(() => wf.recordWeeklyCanopyPerformance(params["id"]!, body.actualKL)));
  });

  router.get("/api/outlets/:id/canopy-file-note.pdf", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const fileNote = outlet.canopyRequest?.fileNote;
    if (!fileNote) throw new ApiError(404, "Canopy file note not generated yet");
    const lines = [
      `System ID: ${fileNote.systemId} | Initiated: ${fileNote.initiatedOn}`,
      fileNote.subject,
      "",
      ...fileNote.routing.flatMap((r) => [`${r.role} — ${r.actorName}, ${r.actorTitle} (${r.timestamp.slice(0, 19).replace("T", " ")})`, r.remarks, ""]),
      `Status: ${fileNote.status}`,
    ];
    const pdf = generateSimplePdf(`Canopy File Note — ${outlet.name}`, lines);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${outlet.id}_canopy_file_note.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });
}
