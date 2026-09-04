/**
 * Module 7 — Dealer Request Desk: the official two-way communication channel
 * between a dealer and their Sales Officer. A dealer raises a real,
 * recurring category of issue (ROMMS complaint, ITPS/ATG outage, SMS/price-
 * alert delivery failure, or a Market Intelligence submission) against their
 * own outlet; the system assigns an explainable criticality (rule-based, not
 * a black-box score), drafts an AI first-line triage note, and surfaces it
 * to the SO via a linked SO Cockpit / Teams Communication task so it's
 * highlighted by actual urgency rather than buried in a list.
 */
import type {
  DealerRequest,
  DealerRequestCategory,
  DealerRequestMessage,
  DealerRequestStatus,
  ForwardingEntry,
  ModernisationType,
  RequestCriticality,
  SoPriority,
  StakeholderRole,
  TaskItem,
} from "./../types.js";
import { store, nextId } from "../store.js";
import { getAiEngine } from "./aiEngine.js";
import { matchClauses } from "./policyBot.js";
import { createModernisationRequest } from "./modernisation.js";

export class DealerDeskError extends Error {}

function getRequest(id: string): DealerRequest {
  const r = store.dealerRequests.get(id);
  if (!r) throw new DealerDeskError(`Dealer request ${id} not found`);
  return r;
}

function outletOrThrow(outletId: string) {
  const o = store.outlets.get(outletId);
  if (!o) throw new DealerDeskError(`Outlet ${outletId} not found`);
  return o;
}

const CRITICALITY_ORDER: RequestCriticality[] = ["Low", "Medium", "High", "Critical"];
function bump(current: RequestCriticality, atLeast: RequestCriticality): RequestCriticality {
  return CRITICALITY_ORDER[Math.max(CRITICALITY_ORDER.indexOf(current), CRITICALITY_ORDER.indexOf(atLeast))]!;
}

const CATEGORY_BASE_CRITICALITY: Record<DealerRequestCategory, RequestCriticality> = {
  // ITPS feeds real-time stock into SAP — an outage is an audit/vigilance exposure, not just an inconvenience.
  ITPS: "High",
  ROMMS: "Medium",
  SMS: "Medium",
  MarketIntelligence: "Low",
  // A planned investment ask, not an operational fault — the SO works it at their own pace in Module 1.
  Modernisation: "Low",
  // A load/supply issue can put the outlet at risk of running dry — treated as seriously as an ITPS outage.
  Load: "High",
  Other: "Medium",
};

const URGENT_TERMS = ["urgent", "loss of business", "shutdown", "safety", "fire", "leak", "total outage", "not working at all", "no solution", "still not resolved"];

export const SO_PRIORITY_LEVELS: SoPriority[] = ["HighlyCritical", "Critical", "HighImportance", "MediumImportance", "LowImportance"];
export const SO_PRIORITY_LABELS: Record<SoPriority, string> = {
  HighlyCritical: "Highly Critical",
  Critical: "Critical",
  HighImportance: "High Importance",
  MediumImportance: "Medium Importance",
  LowImportance: "Low Importance",
};

export const STAKEHOLDER_ROLES: StakeholderRole[] = ["ManagerEngineering", "MISOfficer", "FinanceOfficer", "DepotTerminalOfficer"];
export const STAKEHOLDER_LABELS: Record<StakeholderRole, string> = {
  ManagerEngineering: "Manager Engineering",
  MISOfficer: "MIS Officer",
  FinanceOfficer: "Finance Officer",
  DepotTerminalOfficer: "Depot/Terminal Officer",
};

/**
 * Combines the rule-engine `criticality` and the SO's own manual `soPriority` into one severity
 * rank so the SO's judgment call actually moves the request in Teams/Cockpit, instead of only
 * showing as a badge on the request's own page. Lower rank = more severe; -1 (Highly Critical)
 * outranks anything the rule engine alone can produce.
 */
const CRITICALITY_RANK: Record<RequestCriticality, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SO_PRIORITY_RANK: Record<SoPriority, number> = { HighlyCritical: -1, Critical: 0, HighImportance: 1, MediumImportance: 2, LowImportance: 3 };

export function effectiveSeverityRank(req: Pick<DealerRequest, "criticality" | "soPriority">): number {
  const a = CRITICALITY_RANK[req.criticality];
  const b = req.soPriority !== undefined ? SO_PRIORITY_RANK[req.soPriority] : Infinity;
  return Math.min(a, b);
}

function taskFieldsForRank(rank: number): { priority: TaskItem["priority"]; urgent: boolean } {
  if (rank <= 1) return { priority: "High", urgent: true };
  if (rank === 2) return { priority: "Medium", urgent: false };
  return { priority: "Low", urgent: false };
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/** Explainable rule-based criticality — a Sales Officer can always see exactly why a request scored the way it did. */
export function computeCriticality(input: {
  category: DealerRequestCategory;
  subject: string;
  description: string;
  externalRaisedDate?: string;
}): { level: RequestCriticality; reason: string } {
  let level = CATEGORY_BASE_CRITICALITY[input.category];
  const reasons = [`Base severity for ${input.category} issues: ${level}.`];

  if (input.externalRaisedDate) {
    const days = daysSince(input.externalRaisedDate);
    if (days >= 7) {
      level = "Critical";
      reasons.push(`Open ${days} day(s) without resolution — SLA breach, raised to Critical.`);
    } else if (days >= 3) {
      level = bump(level, "High");
      reasons.push(`Open ${days} day(s) without resolution — raised to at least High.`);
    } else if (days > 0) {
      reasons.push(`Open ${days} day(s) so far.`);
    }
  }

  const text = `${input.subject} ${input.description}`.toLowerCase();
  const matched = URGENT_TERMS.filter((t) => text.includes(t));
  if (matched.length) {
    level = bump(level, "High");
    reasons.push(`Dealer's own description signals business-impacting urgency (matched: ${matched.join(", ")}) — raised to at least High.`);
  }

  return { level, reason: reasons.join(" ") };
}

function pushMessage(req: DealerRequest, from: DealerRequestMessage["from"], authorName: string, text: string) {
  req.thread.push({ id: nextId("DMSG"), from, authorName, text, timestamp: new Date().toISOString() });
}

function ensureLinkedTask(req: DealerRequest) {
  const so = [...store.team.values()].find((t) => t.role === "SO");
  const { priority, urgent } = taskFieldsForRank(effectiveSeverityRank(req));
  const task: TaskItem = {
    id: nextId("TASK"),
    title: `${req.category} — ${req.subject}`,
    description: req.description,
    assignedTo: (req.assignedTo ?? so?.id) as string,
    assignedBy: "System",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "Open",
    priority,
    urgent,
    important: true,
    linkedModule: "DealerRequest",
    linkedRecordId: req.id,
    createdAt: new Date().toISOString(),
  };
  store.tasks.set(task.id, task);
  req.linkedTaskId = task.id;
}

function syncLinkedTask(req: DealerRequest) {
  if (!req.linkedTaskId) return;
  const task = store.tasks.get(req.linkedTaskId);
  if (!task) return;
  const { priority, urgent } = taskFieldsForRank(effectiveSeverityRank(req));
  task.urgent = urgent;
  task.priority = priority;
  if (req.status === "Resolved") task.status = "Done";
  else if (req.status === "InProgress") task.status = "InProgress";
  else if (req.status === "Escalated") task.status = "Open";
}

export async function raiseDealerRequest(input: {
  outletId: string;
  category: DealerRequestCategory;
  modernisationType?: ModernisationType;
  subject: string;
  description: string;
  externalReferenceNo?: string;
  externalRaisedDate?: string;
  soPriority?: SoPriority;
}): Promise<DealerRequest> {
  const outlet = outletOrThrow(input.outletId);
  if (!input.subject || !input.description) throw new DealerDeskError("subject and description are required");
  if (input.category === "Modernisation" && !input.modernisationType) {
    throw new DealerDeskError("modernisationType is required for a Modernisation request");
  }
  const { level, reason } = computeCriticality(input);
  const so = [...store.team.values()].find((t) => t.role === "SO");
  const matchedClauses = matchClauses(`${input.category} ${input.subject} ${input.description}`, 3);

  const req: DealerRequest = {
    id: nextId("DREQ"),
    outletId: input.outletId,
    dealerName: outlet.dealerName ?? "Dealer",
    category: input.category,
    modernisationType: input.modernisationType,
    subject: input.subject,
    description: input.description,
    externalReferenceNo: input.externalReferenceNo,
    externalRaisedDate: input.externalRaisedDate,
    criticality: level,
    criticalityReason: reason,
    soPriority: input.soPriority,
    citedPolicyClauses: matchedClauses.map((c) => `${c.documentTitle} ${c.clauseNumber}`),
    status: "Open",
    raisedAt: new Date().toISOString(),
    assignedTo: so?.id,
    aiTriageNote: "",
    thread: [],
    forwarding: [],
  };

  pushMessage(req, "Dealer", req.dealerName, input.description);
  req.aiTriageNote = await getAiEngine().generate("dealerRequestTriage", {
    category: req.category,
    subject: req.subject,
    description: req.description,
    criticality: req.criticality,
    criticalityReason: req.criticalityReason,
    outletName: outlet.name,
  });
  pushMessage(req, "AI", "Triage", req.aiTriageNote);

  store.dealerRequests.set(req.id, req);
  ensureLinkedTask(req);

  if (req.category === "Modernisation" && req.modernisationType) {
    const modReq = createModernisationRequest(outlet.id, req.modernisationType, req.description, req.id);
    req.linkedModernisationRequestId = modReq.id;
  }

  return req;
}

export function addDealerFollowup(requestId: string, text: string): DealerRequest {
  const req = getRequest(requestId);
  pushMessage(req, "Dealer", req.dealerName, text);
  if (req.status === "Resolved") req.status = "Open"; // reopened by the dealer
  syncLinkedTask(req);
  return req;
}

export function addSoResponse(requestId: string, responderName: string, text: string, newStatus?: DealerRequestStatus): DealerRequest {
  const req = getRequest(requestId);
  pushMessage(req, "SO", responderName, text);
  if (newStatus) req.status = newStatus;
  else if (req.status === "Open") req.status = "InProgress";
  syncLinkedTask(req);
  return req;
}

export function setSoPriority(requestId: string, soPriority: SoPriority, setBy: string): DealerRequest {
  const req = getRequest(requestId);
  req.soPriority = soPriority;
  pushMessage(req, "System", setBy, `Priority set to ${SO_PRIORITY_LABELS[soPriority]}.`);
  syncLinkedTask(req);
  return req;
}

/** Real seat for a stakeholder role — seeded in seedTeam so forwarding always has someone to assign to. */
function stakeholderMember(role: StakeholderRole) {
  const member = [...store.team.values()].find((t) => t.role === role);
  if (!member) throw new DealerDeskError(`No team member seeded for stakeholder role ${role}`);
  return member;
}

export function forwardRequest(requestId: string, stakeholders: StakeholderRole[], forwardedBy: string, note?: string): DealerRequest {
  const req = getRequest(requestId);
  if (!stakeholders.length) throw new DealerDeskError("at least one stakeholder is required");
  const { priority, urgent } = taskFieldsForRank(effectiveSeverityRank(req));
  const taskIds: string[] = [];
  for (const role of stakeholders) {
    const member = stakeholderMember(role);
    const task: TaskItem = {
      id: nextId("TASK"),
      title: `Forwarded: ${req.subject}`,
      description: `${req.description}${note ? `\n\nSO note: ${note}` : ""}`,
      assignedTo: member.id,
      assignedBy: forwardedBy,
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      status: "Open",
      priority,
      urgent,
      important: true,
      linkedModule: "DealerRequest",
      linkedRecordId: req.id,
      createdAt: new Date().toISOString(),
    };
    store.tasks.set(task.id, task);
    taskIds.push(task.id);
  }
  const entry: ForwardingEntry = {
    id: nextId("FWD"),
    stakeholders,
    note,
    forwardedBy,
    forwardedAt: new Date().toISOString(),
    taskIds,
  };
  req.forwarding.push(entry);
  const names = stakeholders.map((s) => STAKEHOLDER_LABELS[s]).join(", ");
  pushMessage(req, "SO", forwardedBy, `Forwarded to ${names} — task(s) created in Teams/Cockpit.${note ? ` Note: ${note}` : ""}`);
  return req;
}

export function escalateRequest(requestId: string, escalatedBy: string, reason: string): DealerRequest {
  const req = getRequest(requestId);
  req.status = "Escalated";
  req.criticality = bump(req.criticality, "High");
  pushMessage(req, "SO", escalatedBy, `Escalated: ${reason}`);
  syncLinkedTask(req);
  return req;
}

export function resolveRequest(requestId: string, resolvedBy: string, resolutionSummary: string): DealerRequest {
  const req = getRequest(requestId);
  req.status = "Resolved";
  req.resolvedAt = new Date().toISOString();
  req.resolutionSummary = resolutionSummary;
  pushMessage(req, "SO", resolvedBy, `Resolved: ${resolutionSummary}`);
  syncLinkedTask(req);
  return req;
}

export function listDealerRequests(): DealerRequest[] {
  return [...store.dealerRequests.values()].sort(
    (a, b) => effectiveSeverityRank(a) - effectiveSeverityRank(b) || b.raisedAt.localeCompare(a.raisedAt),
  );
}

export function getDealerRequest(id: string): DealerRequest {
  return getRequest(id);
}

export function requestsForOutlet(outletId: string): DealerRequest[] {
  return listDealerRequests().filter((r) => r.outletId === outletId);
}

/** Highly-ranked requests (by rule-engine criticality OR SO-assigned priority) not yet resolved. */
export function criticalOpenRequests(): DealerRequest[] {
  return listDealerRequests().filter((r) => effectiveSeverityRank(r) <= 1 && r.status !== "Resolved");
}
