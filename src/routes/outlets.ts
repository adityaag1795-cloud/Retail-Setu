import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { store, nextId } from "../store.js";
import type { Communication } from "../types.js";
import { generateSimplePdf } from "../services/pdfGen.js";
import { monthlyKL, dryDayCount, outletTankStock } from "../services/predictive.js";
import { requestsForOutlet } from "../services/dealerDesk.js";
import * as wf from "../services/dealerWorkflow.js";
import * as mod from "../services/modernisation.js";
import { hasTrafficData, trafficForOutlet, vehicleTypeAverages, productAverages, peakHour, nozzleStatusForOutlet } from "../services/trafficAnalytics.js";
import { analyseAndApplyOutletInput, outletDataNotesFor, OutletInputError } from "../services/outletInput.js";
import type { ActionPoint } from "../types.js";

function outletOrThrow(id: string) {
  const o = store.outlets.get(id);
  if (!o) throw new ApiError(404, `Outlet ${id} not found`);
  return o;
}

async function wrap<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof wf.WorkflowError || err instanceof mod.ModernisationError) throw new ApiError(409, err.message);
    if (err instanceof OutletInputError) throw new ApiError(400, err.message);
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
    const tradingArea = outlet.tradingAreaId ? store.tradingAreas.get(outlet.tradingAreaId) : undefined;
    const actionPoints = [...store.actionPoints.values()].filter((a) => a.outletId === outlet.id).sort((a, b) => b.date.localeCompare(a.date));
    const traffic = hasTrafficData(outlet.id)
      ? {
          vehicleTypeAverages: vehicleTypeAverages(outlet.id, 7).perDay,
          productAverages: productAverages(outlet.id, 7).perDay,
          avgWindowDays: vehicleTypeAverages(outlet.id, 7).daysAveraged,
          peakHour: peakHour(outlet.id, 7),
          nozzles: nozzleStatusForOutlet(outlet.id),
          daysOnFile: trafficForOutlet(outlet.id).length,
        }
      : undefined;
    sendJson(res, 200, {
      outlet,
      masterSheetTable: Object.entries(outlet.masterSheet).map(([field, value]) => ({ field, value })),
      fixedAssetSummary: fixedAssetSummary(outlet),
      communications: comms,
      last30DaysKL: monthlyKL(outlet.id),
      dryDaysLast60: dryDayCount(outlet.id),
      tankStock: outletTankStock(outlet.id),
      dealerRequests: requestsForOutlet(outlet.id),
      modernisationRequests: outlet.modernisationRequests,
      linkedCase: linkedCase ? { id: linkedCase.id, stage: linkedCase.stage } : undefined,
      tradingArea: tradingArea ? { id: tradingArea.id, name: tradingArea.name } : undefined,
      actionPoints,
      traffic,
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

  // Modernisation Request sub-workflow (Canopy/Driveway/DU/Tank/Electric Panel) — initiated via
  // Module 7 (Dealer Request Desk); reviewed here on the outlet ("for recommendation").
  router.post("/api/outlets/:id/modernisation-requests/:reqId/justification", async (req, res, params) => {
    const body = await readJsonBody<{ soJustification: string }>(req);
    if (!body.soJustification) throw new ApiError(400, "soJustification is required");
    sendJson(res, 200, await wrap(() => mod.setSoJustification(params["id"]!, params["reqId"]!, body.soJustification)));
  });

  router.post("/api/outlets/:id/modernisation-requests/:reqId/cost-estimate", async (req, res, params) => {
    const body = await readJsonBody<{ lineItems: { id: string; qty: number; rate: number }[] }>(req);
    sendJson(res, 200, await wrap(() => mod.updateCostEstimateLineItems(params["id"]!, params["reqId"]!, body.lineItems ?? [])));
  });

  router.post("/api/outlets/:id/modernisation-requests/:reqId/irr", async (req, res, params) => {
    const body = await readJsonBody<Parameters<typeof mod.updateIrrAssumptions>[2]>(req);
    sendJson(res, 200, await wrap(() => mod.updateIrrAssumptions(params["id"]!, params["reqId"]!, body)));
  });

  router.post("/api/outlets/:id/modernisation-requests/:reqId/decision", async (req, res, params) => {
    const body = await readJsonBody<{ decision: "Approved" | "Rejected"; justification: string; decidedBy: string }>(req);
    sendJson(
      res,
      200,
      await wrap(() => mod.decideModernisationRequest(params["id"]!, params["reqId"]!, body.decision, body.justification, body.decidedBy ?? "SO")),
    );
  });

  router.post("/api/outlets/:id/modernisation-requests/:reqId/eam", async (req, res, params) => {
    const body = await readJsonBody<{ approve: boolean }>(req);
    sendJson(res, 200, await wrap(() => mod.decideModernisationEAM(params["id"]!, params["reqId"]!, !!body.approve)));
  });

  router.post("/api/outlets/:id/modernisation-requests/:reqId/weekly-check", async (req, res, params) => {
    const body = await readJsonBody<{ actualKL: number }>(req);
    sendJson(res, 200, await wrap(() => mod.recordWeeklyModernisationPerformance(params["id"]!, params["reqId"]!, body.actualKL)));
  });

  router.get("/api/outlets/:id/modernisation-requests/:reqId/file-note.pdf", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const modReq = outlet.modernisationRequests.find((r) => r.id === params["reqId"]);
    const fileNote = modReq?.fileNote;
    if (!fileNote) throw new ApiError(404, "Modernisation file note not generated yet");
    const lines = [
      `System ID: ${fileNote.systemId} | Initiated: ${fileNote.initiatedOn}`,
      fileNote.subject,
      "",
      ...fileNote.routing.flatMap((r) => [`${r.role} — ${r.actorName}, ${r.actorTitle} (${r.timestamp.slice(0, 19).replace("T", " ")})`, r.remarks, ""]),
      `Status: ${fileNote.status}`,
    ];
    const pdf = generateSimplePdf(`Modernisation File Note — ${outlet.name}`, lines);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${outlet.id}_modernisation_file_note.pdf"`,
      "content-length": pdf.length,
    });
    res.end(pdf);
  });

  // Action Points / Minutes of Meeting — SO's own memory + follow-up tracker per outlet.
  router.get("/api/outlets/:id/action-points", (_req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    sendJson(
      res,
      200,
      [...store.actionPoints.values()].filter((a) => a.outletId === outlet.id).sort((a, b) => b.date.localeCompare(a.date)),
    );
  });

  router.post("/api/outlets/:id/action-points", async (req, res, params) => {
    const outlet = outletOrThrow(params["id"]!);
    const body = await readJsonBody<Partial<ActionPoint>>(req);
    if (!body.title || !body.raisedBy) throw new ApiError(400, "title and raisedBy are required");
    const point: ActionPoint = {
      id: nextId("AP"),
      outletId: outlet.id,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      raisedBy: body.raisedBy,
      title: body.title,
      notes: body.notes ?? "",
      actionRequired: body.actionRequired,
      owner: body.owner,
      dueDate: body.dueDate,
      status: body.status ?? "Open",
      createdAt: new Date().toISOString(),
    };
    store.actionPoints.set(point.id, point);
    sendJson(res, 201, point);
  });

  router.put("/api/outlets/:id/action-points/:apId", async (req, res, params) => {
    outletOrThrow(params["id"]!);
    const point = store.actionPoints.get(params["apId"]!);
    if (!point || point.outletId !== params["id"]) throw new ApiError(404, "Action point not found");
    const body = await readJsonBody<Partial<ActionPoint>>(req);
    const justCompleted = body.status === "Done" && point.status !== "Done";
    Object.assign(point, body);
    if (justCompleted) point.completedAt = new Date().toISOString();
    else if (body.status && body.status !== "Done") point.completedAt = undefined;
    sendJson(res, 200, point);
  });

  // Free-form "keep feeding me data" input tap — one fact per line, no code change needed. See
  // services/outletInput.ts for what gets applied directly vs. merged into the Master Sheet vs.
  // kept as a plain note.
  router.get("/api/outlets/:id/data-input", (_req, res, params) => {
    outletOrThrow(params["id"]!);
    sendJson(res, 200, outletDataNotesFor(params["id"]!));
  });

  router.post("/api/outlets/:id/data-input", async (req, res, params) => {
    outletOrThrow(params["id"]!);
    const body = await readJsonBody<{ text: string }>(req);
    if (!body.text) throw new ApiError(400, "text is required");
    const note = await wrap(() => analyseAndApplyOutletInput(params["id"]!, body.text));
    sendJson(res, 201, { note, outlet: store.outlets.get(params["id"]!) });
  });
}
