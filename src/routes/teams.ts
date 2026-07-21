import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { store, nextId } from "../store.js";
import type { TaskItem, MemoryNote } from "../types.js";
import { stuckMilestones } from "../services/dealerWorkflow.js";
import { criticalOpenRequests } from "../services/dealerDesk.js";
import { kpiTracker } from "../services/kpiTracker.js";

export function registerTeamRoutes(router: Router) {
  router.get("/api/team", (_req, res) => {
    sendJson(res, 200, [...store.team.values()]);
  });

  // KPI Tracker — target = last year's real monthly actual (per product), achieved = this
  // year's real actual so far; ?outletId= scopes to one outlet, omit for all outlets combined.
  router.get("/api/kpi-tracker", (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const outletId = url.searchParams.get("outletId") ?? undefined;
    sendJson(res, 200, kpiTracker(outletId));
  });

  router.get("/api/tasks", (_req, res) => {
    sendJson(res, 200, [...store.tasks.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  });

  router.post("/api/tasks", async (req, res) => {
    const body = await readJsonBody<Partial<TaskItem>>(req);
    if (!body.title || !body.assignedTo || !body.assignedBy || !body.dueDate) {
      throw new ApiError(400, "title, assignedTo, assignedBy and dueDate are required");
    }
    const task: TaskItem = {
      id: nextId("TASK"),
      title: body.title,
      description: body.description ?? "",
      assignedTo: body.assignedTo,
      assignedBy: body.assignedBy,
      dueDate: body.dueDate,
      status: body.status ?? "Open",
      priority: body.priority ?? "Medium",
      urgent: body.urgent ?? false,
      important: body.important ?? false,
      linkedModule: body.linkedModule,
      linkedRecordId: body.linkedRecordId,
      createdAt: new Date().toISOString(),
    };
    store.tasks.set(task.id, task);
    sendJson(res, 201, task);
  });

  router.put("/api/tasks/:id", async (req, res, params) => {
    const task = store.tasks.get(params["id"]!);
    if (!task) throw new ApiError(404, "Task not found");
    const body = await readJsonBody<Partial<TaskItem>>(req);
    const justCompleted = body.status === "Done" && task.status !== "Done";
    Object.assign(task, body);
    if (justCompleted) task.completedAt = new Date().toISOString();
    else if (body.status && body.status !== "Done") task.completedAt = undefined;
    sendJson(res, 200, task);
  });

  router.get("/api/kpis", (_req, res) => {
    sendJson(res, 200, [...store.kpis.values()]);
  });

  router.get("/api/memory-notes", (_req, res) => {
    sendJson(res, 200, [...store.memoryNotes.values()].sort((a, b) => b.date.localeCompare(a.date)));
  });

  router.post("/api/memory-notes", async (req, res) => {
    const body = await readJsonBody<Partial<MemoryNote>>(req);
    if (!body.text || !body.author) throw new ApiError(400, "text and author are required");
    const note: MemoryNote = {
      id: nextId("NOTE"),
      author: body.author,
      date: new Date().toISOString(),
      text: body.text,
      tags: body.tags ?? [],
    };
    store.memoryNotes.set(note.id, note);
    sendJson(res, 201, note);
  });

  // "Open workflows & proposals awaiting approval" summary for the team-communication view.
  router.get("/api/teams/open-workflows", (_req, res) => {
    const cases = [...store.dealerCases.values()].filter((c) => c.stage !== "Commissioned");
    const caseProposals = [...store.dealerCases.values()]
      .filter((c) => (c.fileNote && c.fileNote.status === "Draft") || (c.budget && c.budget.status === "Submitted"))
      .map((c) => ({
        caseId: c.id,
        stretchName: c.stretchName,
        awaiting: c.fileNote?.status === "Draft" ? "File note approval" : "Budget approval",
      }));
    const modernisationProposals = [...store.outlets.values()]
      .flatMap((o) => o.modernisationRequests.filter((r) => !r.soDecision).map((r) => ({ outlet: o, request: r })))
      .map(({ outlet, request }) => ({
        outletId: outlet.id,
        outletName: outlet.name,
        modernisationType: request.modernisationType,
        awaiting: request.soJustification ? "SO decision" : "SO justification & cost/IRR review",
      }));
    sendJson(res, 200, {
      openCases: cases.map((c) => ({ id: c.id, stretchName: c.stretchName, stage: c.stage })),
      proposalsAwaitingApproval: caseProposals,
      modernisationProposalsAwaitingApproval: modernisationProposals,
      stuckMilestones: stuckMilestones(),
      criticalDealerRequests: criticalOpenRequests().map((r) => ({
        id: r.id,
        outletId: r.outletId,
        category: r.category,
        subject: r.subject,
        criticality: r.criticality,
        status: r.status,
      })),
    });
  });
}
