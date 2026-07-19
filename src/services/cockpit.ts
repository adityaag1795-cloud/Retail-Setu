import { store } from "../store.js";
import type { CalendarEvent, CockpitQuadrant, TaskItem } from "../types.js";

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

export function cockpitSnapshot() {
  return {
    quadrants: quadrantBoard(),
    calendar: circuitCalendar(),
    generatedAt: new Date().toISOString(),
  };
}
