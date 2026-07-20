import { store } from "../store.js";
import type { CalendarEvent, CockpitQuadrant, TaskItem } from "../types.js";

export interface CompletedLogItem {
  id: string;
  title: string;
  source: "Task" | "ActionPoint";
  completedAt: string;
  linkedModule?: string;
  linkedRecordId?: string;
}

const QUADRANT_LABEL: Record<CockpitQuadrant, string> = {
  DoFirst: "Do First (urgent & important)",
  Schedule: "Schedule (important, not urgent)",
  Delegate: "Delegate (urgent, not important)",
  Eliminate: "Eliminate (neither)",
};

export function classify(task: TaskItem): CockpitQuadrant {
  if (task.urgent && task.important) return "DoFirst";
  if (!task.urgent && task.important) return "Schedule";
  if (task.urgent && !task.important) return "Delegate";
  return "Eliminate";
}

export function quadrantBoard() {
  const board: Record<CockpitQuadrant, { label: string; tasks: TaskItem[] }> = {
    DoFirst: { label: QUADRANT_LABEL.DoFirst, tasks: [] },
    Schedule: { label: QUADRANT_LABEL.Schedule, tasks: [] },
    Delegate: { label: QUADRANT_LABEL.Delegate, tasks: [] },
    Eliminate: { label: QUADRANT_LABEL.Eliminate, tasks: [] },
  };
  for (const task of store.tasks.values()) {
    if (task.status === "Done") continue;
    board[classify(task)].tasks.push(task);
  }
  return board;
}

/** Derives a town/circuit-wise pending-inspection & meeting calendar from live DealerCase state. */
export function circuitCalendar(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const c of store.dealerCases.values()) {
    const town = c.stretchName;
    if (!c.inspections.asc) events.push(mkEvent(c.id, town, c.salesArea, "ASC", `ASC pending — ${c.stretchName}`));
    if (!c.inspections.lec) events.push(mkEvent(c.id, town, c.salesArea, "LEC", `LEC pending — ${c.stretchName}`));
    if (!c.inspections.fvc) events.push(mkEvent(c.id, town, c.salesArea, "FVC", `FVC pending — ${c.stretchName}`));
    for (const m of c.milestones) {
      if (m.status === "Pending" || m.status === "Stuck") {
        events.push(mkEvent(c.id, town, c.salesArea, "NOC-Followup", `${m.label} — ${c.stretchName}`));
      }
    }
  }
  return events;
}

let seq = 0;
function mkEvent(caseId: string, town: string, salesArea: string, type: CalendarEvent["type"], title: string): CalendarEvent {
  seq += 1;
  const date = new Date();
  date.setDate(date.getDate() + (seq % 7));
  return {
    id: `CAL-${seq}`,
    date: date.toISOString().slice(0, 10),
    type,
    title,
    salesArea,
    town,
    linkedCaseId: caseId,
  };
}

/**
 * Record of what was actually done, and on which date — completed Cockpit/Teams tasks and outlet
 * action points both drop off their respective to-do lists the moment they're marked Done, but
 * that shouldn't erase the record of the work; this groups them by completion date instead.
 */
export function completedLog(): { date: string; items: CompletedLogItem[] }[] {
  const items: CompletedLogItem[] = [];
  for (const t of store.tasks.values()) {
    if (t.status === "Done" && t.completedAt) {
      items.push({ id: t.id, title: t.title, source: "Task", completedAt: t.completedAt, linkedModule: t.linkedModule, linkedRecordId: t.linkedRecordId });
    }
  }
  for (const a of store.actionPoints.values()) {
    if (a.status === "Done" && a.completedAt) {
      const outlet = store.outlets.get(a.outletId);
      items.push({
        id: a.id,
        title: `${a.title}${outlet ? ` — ${outlet.name}` : ""}`,
        source: "ActionPoint",
        completedAt: a.completedAt,
        linkedModule: "Outlet",
        linkedRecordId: a.outletId,
      });
    }
  }
  const byDate = new Map<string, CompletedLogItem[]>();
  for (const item of items) {
    const date = item.completedAt.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(item);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dateItems]) => ({ date, items: dateItems.sort((a, b) => b.completedAt.localeCompare(a.completedAt)) }));
}

export function cockpitSnapshot() {
  return {
    quadrants: quadrantBoard(),
    calendar: circuitCalendar(),
    completedLog: completedLog(),
    generatedAt: new Date().toISOString(),
  };
}
