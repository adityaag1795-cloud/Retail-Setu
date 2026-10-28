import type { OutletDataNote, OutletStatus } from "../types.js";
import { store, nextId } from "../store.js";

export class OutletInputError extends Error {}

const OUTLET_STATUSES: OutletStatus[] = ["Prospective", "UnderDevelopment", "Operational", "Closed"];

function normaliseKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseBoolean(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "started"].includes(v)) return true;
  if (["no", "n", "false", "not started"].includes(v)) return false;
  return undefined;
}

/**
 * Applies whatever the SO keeps feeding in, one fact per line — no code change needed. Lines
 * matching a known Outlet field are applied directly (typed, validated); any other "Key: Value"
 * line merges into the outlet's free-form Master Sheet; anything else is kept verbatim as a note
 * rather than silently dropped or guessed at, per this project's own "no fabrication" principle.
 */
export function analyseAndApplyOutletInput(outletId: string, rawText: string): OutletDataNote {
  const outlet = store.outlets.get(outletId);
  if (!outlet) throw new OutletInputError(`Outlet ${outletId} not found`);
  if (!rawText.trim()) throw new OutletInputError("No text provided");

  const structuredFieldUpdates: OutletDataNote["structuredFieldUpdates"] = [];
  const masterSheetUpdates: OutletDataNote["masterSheetUpdates"] = [];
  const freeTextNotes: string[] = [];

  const lines = rawText.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!m) {
      freeTextNotes.push(line);
      continue;
    }
    const [, rawKey, rawValue] = m;
    const key = normaliseKey(rawKey!);
    const value = rawValue!.trim();

    if (key === "status") {
      const matched = OUTLET_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase().replace(/\s+/g, ""));
      if (matched) {
        structuredFieldUpdates.push({ field: "status", oldValue: outlet.status, newValue: matched });
        outlet.status = matched;
      } else {
        freeTextNotes.push(`${line} (unrecognised status value — not applied)`);
      }
      continue;
    }
    if (key === "dealername") {
      structuredFieldUpdates.push({ field: "dealerName", oldValue: outlet.dealerName ?? "(none)", newValue: value });
      outlet.dealerName = value;
      continue;
    }
    if (key === "canopy") {
      const b = parseBoolean(value);
      if (b !== undefined) {
        structuredFieldUpdates.push({ field: "canopy", oldValue: String(outlet.canopy), newValue: String(b) });
        outlet.canopy = b;
      } else {
        freeTextNotes.push(`${line} (expected yes/no — not applied)`);
      }
      continue;
    }
    if (key === "nozzlesalesstarted") {
      const b = parseBoolean(value);
      if (b !== undefined) {
        structuredFieldUpdates.push({ field: "nozzleSalesStarted", oldValue: String(outlet.nozzleSalesStarted), newValue: String(b) });
        outlet.nozzleSalesStarted = b;
      } else {
        freeTextNotes.push(`${line} (expected yes/no — not applied)`);
      }
      continue;
    }
    if (key === "taaveragekl") {
      const n = Number(value.replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n) && n > 0) {
        structuredFieldUpdates.push({ field: "taAverageKL", oldValue: String(outlet.taAverageKL), newValue: String(n) });
        outlet.taAverageKL = n;
      } else {
        freeTextNotes.push(`${line} (expected a number — not applied)`);
      }
      continue;
    }

    // Not a known structured field — merge into the outlet's free-form Master Sheet, same as the
    // real master workbook's own miscellaneous columns.
    const oldValue = outlet.masterSheet[rawKey!.trim()];
    outlet.masterSheet[rawKey!.trim()] = value;
    masterSheetUpdates.push({ key: rawKey!.trim(), oldValue, newValue: value });
  }

  const note: OutletDataNote = {
    id: nextId("ODN"),
    outletId,
    submittedAt: new Date().toISOString(),
    rawText,
    structuredFieldUpdates,
    masterSheetUpdates,
    freeTextNotes,
  };
  store.outletDataNotes.set(note.id, note);
  return note;
}

export function outletDataNotesFor(outletId: string): OutletDataNote[] {
  return [...store.outletDataNotes.values()].filter((n) => n.outletId === outletId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}
