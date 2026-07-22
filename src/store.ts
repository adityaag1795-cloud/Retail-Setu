import type {
  Outlet,
  Communication,
  SalesRecord,
  TankStock,
  TeamMember,
  TaskItem,
  KPIRecord,
  MemoryNote,
  PolicyClause,
  DealerCase,
  DealerRequest,
  Milestone,
  MilestoneKey,
  ActivityEntry,
  DailyTrafficSummary,
  NozzleActivity,
  ActionPoint,
  TradingAreaSnapshot,
  OutletDataNote,
  EnergyManualEntry,
  OutletCriticalityMonitor,
  ItpsTransactionDay,
} from "./types.js";
import {
  seedOutlets,
  seedSalesRecords,
  seedStockSnapshots,
  seedCommunications,
  seedTeam,
  seedPolicyClauses,
  seedDealerCases,
  seedDealerRequests,
  seedTradingAreas,
} from "./data/seed.js";
import { SEED_DAILY_TRAFFIC, SEED_NOZZLE_ACTIVITY } from "./data/trafficData.js";
import { SEED_OUTLET_CRITICALITY } from "./data/outletCriticalityData.js";
import { SEED_ITPS_TRANSACTIONS } from "./data/itpsTransactionData.js";

let counter = 10000;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export const MILESTONE_TEMPLATE: { key: MilestoneKey; label: string }[] = [
  { key: "OfferLetter", label: "Offer Letter taken from LOI holder" },
  { key: "MapSubmission", label: "Submission of site map" },
  { key: "DrawingAndDMLetter", label: "Submission of drawing & letter by company to District Magistrate" },
  { key: "PESOApplication", label: "PESO application filed" },
  { key: "PESOReceipt", label: "PESO receipt obtained" },
  { key: "DeptForwarding", label: "DM's letter forwarded to PWD / NHAI / Tehsildar / Town Planning / Panchayat" },
  { key: "NOCReceived", label: "NOC received" },
];

export function freshMilestones(): Milestone[] {
  return MILESTONE_TEMPLATE.map((m) => ({ key: m.key, label: m.label, status: "Pending" as const }));
}

class Store {
  outlets = new Map<string, Outlet>();
  communications = new Map<string, Communication>();
  salesRecords: SalesRecord[] = [];
  stockSnapshots: TankStock[] = [];
  team = new Map<string, TeamMember>();
  tasks = new Map<string, TaskItem>();
  kpis = new Map<string, KPIRecord>();
  memoryNotes = new Map<string, MemoryNote>();
  policyClauses = new Map<string, PolicyClause>();
  dealerCases = new Map<string, DealerCase>();
  dealerRequests = new Map<string, DealerRequest>();
  dailyTraffic: DailyTrafficSummary[] = [];
  nozzleActivity: NozzleActivity[] = [];
  actionPoints = new Map<string, ActionPoint>();
  tradingAreas = new Map<string, TradingAreaSnapshot>();
  outletDataNotes = new Map<string, OutletDataNote>();
  /** SO's manual fallback entries for the daily energy-news/crude-rate cockpit column — used when the live fetch fails. */
  energyManualEntries: EnergyManualEntry[] = [];
  /** Real per-outlet dry-risk/indent/funds status from HPCL's own Outlet Criticality Monitor workbook. */
  criticalityMonitor: OutletCriticalityMonitor[] = [];
  /** Real day-wise ITPS (online) transaction counts from HPCL's own Online Transactions report. */
  itpsTransactions: ItpsTransactionDay[] = [];

  constructor() {
    seedOutlets.forEach((o) => this.outlets.set(o.id, o));
    seedCommunications.forEach((c) => this.communications.set(c.id, c));
    this.salesRecords = [...seedSalesRecords];
    this.stockSnapshots = [...seedStockSnapshots];
    this.criticalityMonitor = [...SEED_OUTLET_CRITICALITY];
    this.itpsTransactions = [...SEED_ITPS_TRANSACTIONS];
    this.dailyTraffic = [...SEED_DAILY_TRAFFIC];
    this.nozzleActivity = [...SEED_NOZZLE_ACTIVITY];
    seedTeam.forEach((t) => this.team.set(t.id, t));
    seedPolicyClauses.forEach((p) => this.policyClauses.set(p.id, p));
    seedDealerCases.forEach((c) => this.dealerCases.set(c.id, c));
    seedDealerRequests.forEach((r) => this.dealerRequests.set(r.id, r));
    seedTradingAreas.forEach((t) => this.tradingAreas.set(t.id, t));
    this.seedDerivedTasks();
  }

  private seedDerivedTasks() {
    const so = seedTeam.find((t) => t.role === "SO")!;
    const ro = seedTeam.find((t) => t.role === "RO")!;
    const tasks: TaskItem[] = [
      {
        id: nextId("TASK"),
        title: "Review Gayatri Filling Station — lease lapsed, sales collapsed",
        description: "Outlet's land lease expired 31.05.2024 and sales have collapsed since (see Module 3 predictive analytics). Assess whether to open a Resitement case.",
        assignedTo: so.id,
        assignedBy: ro.id,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        status: "Open",
        priority: "High",
        urgent: true,
        important: true,
        linkedModule: "Outlet",
        linkedRecordId: "OUT-41014421",
        createdAt: new Date().toISOString(),
      },
      {
        id: nextId("TASK"),
        title: "Close CRM complaint",
        description: "Complaint due for closure by 27.07.2026 — visit the CRM portal to close it out.",
        assignedTo: so.id,
        assignedBy: ro.id,
        dueDate: "2026-07-27",
        status: "Open",
        priority: "Medium",
        urgent: false,
        important: true,
        externalUrl: "https://rishte.hpcl.co.in",
        createdAt: new Date().toISOString(),
      },
      {
        id: nextId("TASK"),
        title: "HP Service Centre - Faridabad — Google rating dropped to 2",
        description: "Outlet's Google Business listing is showing a rating of 2 — review recent customer feedback on the Single Interface dashboard and respond/action as needed.",
        assignedTo: so.id,
        assignedBy: ro.id,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        status: "Open",
        priority: "Medium",
        urgent: false,
        important: true,
        linkedModule: "Outlet",
        linkedRecordId: "OUT-41068065",
        externalUrl: "https://backend-dashboard.singleinterface.com/pages/index.html",
        createdAt: new Date().toISOString(),
      },
      {
        id: nextId("TASK"),
        title: "Sales forecast submission deadline",
        description: "Sales forecast for the sales area is due 28.07.2026 — submit via the Demand Forecast portal.",
        assignedTo: so.id,
        assignedBy: ro.id,
        dueDate: "2026-07-28",
        status: "Open",
        priority: "Medium",
        urgent: false,
        important: true,
        externalUrl: "https://df.hpcl.co.in/SASVisualAnalytics/",
        createdAt: new Date().toISOString(),
      },
      {
        id: nextId("TASK"),
        title: "Weekly DSO-Dealer review meeting",
        description: "Regular meeting by the DSO with dealers in the sales area — recurring weekly review, not tied to a single outlet.",
        assignedTo: so.id,
        assignedBy: ro.id,
        dueDate: "2026-07-27",
        status: "Open",
        priority: "Low",
        urgent: false,
        important: true,
        createdAt: new Date().toISOString(),
      },
    ];
    tasks.forEach((t) => this.tasks.set(t.id, t));
  }

  /** Outlets curated into the prototype's demo set — every "list all outlets" surface should use this, not the raw map, so hidden outlets stay reachable by direct ID (e.g. a Module 2 case link) without appearing in any listing. */
  visibleOutlets(): Outlet[] {
    return [...this.outlets.values()].filter((o) => !o.hiddenInPrototype);
  }

  logActivity(dealerCase: DealerCase, actor: string, action: string, details?: string) {
    const entry: ActivityEntry = {
      id: nextId("ACT"),
      timestamp: new Date().toISOString(),
      actor,
      action,
      details,
    };
    dealerCase.activityLog.push(entry);
  }
}

export const store = new Store();
