/**
 * Module 1/3 — "Input Tap": lets the SO upload a real, current sales or tank-stock snapshot
 * (.xlsx or .csv) directly, instead of needing a code change every time new data arrives.
 *
 * Expected column headers (case-insensitive; export straight from SAP/CRIS with these headers):
 *   Sales snapshot:  "SAP Code", "Date" (YYYY-MM-DD), "MS (KL)", "HSD (KL)"
 *   Stock snapshot:  "SAP Code", "Product", "Stock Date" (YYYY-MM-DD), "Capacity (Ltr)",
 *                    "Stock Qty (Ltr)", "Pumpable Stock (Ltr)", "Ullage (Ltr)"
 *
 * Rows are upserted into the live in-memory store immediately (no restart needed), and the full
 * resulting dataset is written to disk under data/uploads/ so it survives a server restart too —
 * server.ts calls applyPersistedOverridesOnStartup() once at boot to reload it, if present.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Outlet } from "../types.js";
import { store } from "../store.js";
import { parseXlsxFirstSheet, parseCsv, cellByHeader, type ParsedSheet } from "./xlsxReader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data", "uploads");
const SALES_FILE = path.join(DATA_DIR, "sales.json");
const STOCK_FILE = path.join(DATA_DIR, "stock.json");

export class DataUploadError extends Error {}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Called once at server startup (after the store's seed data is loaded) — if a previous session
 * uploaded a sales/stock snapshot, replace the in-memory arrays with that persisted full state
 * (each upload persists the *whole* resulting dataset, not a delta) so uploads survive a restart.
 */
export function applyPersistedOverridesOnStartup(): void {
  try {
    if (existsSync(SALES_FILE)) store.salesRecords = JSON.parse(readFileSync(SALES_FILE, "utf-8"));
  } catch {
    /* corrupt/missing — ignore, seed data still applies */
  }
  try {
    if (existsSync(STOCK_FILE)) store.stockSnapshots = JSON.parse(readFileSync(STOCK_FILE, "utf-8"));
  } catch {
    /* ignore */
  }
}

function persistSales() {
  ensureDataDir();
  writeFileSync(SALES_FILE, JSON.stringify(store.salesRecords, null, 2));
}

function persistStock() {
  ensureDataDir();
  writeFileSync(STOCK_FILE, JSON.stringify(store.stockSnapshots, null, 2));
}

function findOutletBySap(sapCode: string): Outlet | undefined {
  const direct = store.outlets.get(`OUT-${sapCode}`);
  if (direct) return direct;
  return [...store.outlets.values()].find((o) => o.masterSheet["SAP Code"] === sapCode);
}

function parseUpload(fileName: string, text?: string, base64?: string): ParsedSheet {
  if (base64) {
    const buf = Buffer.from(base64, "base64");
    if (fileName.toLowerCase().endsWith(".csv")) return parseCsv(buf.toString("utf-8"));
    return parseXlsxFirstSheet(buf);
  }
  if (text !== undefined) return parseCsv(text);
  throw new DataUploadError("No file content supplied");
}

export interface UploadResult {
  rowsRead: number;
  rowsApplied: number;
  warnings: string[];
}

export function uploadSalesSnapshot(fileName: string, opts: { text?: string; base64?: string }): UploadResult {
  const { header, rows } = parseUpload(fileName, opts.text, opts.base64);
  const warnings: string[] = [];
  let applied = 0;

  for (const [i, row] of rows.entries()) {
    const sapCode = String(cellByHeader(header, row, "SAP Code") ?? "").trim();
    const date = String(cellByHeader(header, row, "Date") ?? "").trim();
    const msKL = Number(cellByHeader(header, row, "MS (KL)") ?? 0);
    const hsdKL = Number(cellByHeader(header, row, "HSD (KL)") ?? 0);
    if (!sapCode || !date) {
      warnings.push(`Row ${i + 2}: missing SAP Code or Date — skipped.`);
      continue;
    }
    const outlet = findOutletBySap(sapCode);
    if (!outlet) {
      warnings.push(`Row ${i + 2}: no outlet found for SAP Code ${sapCode} — skipped.`);
      continue;
    }
    const existing = store.salesRecords.find((r) => r.outletId === outlet.id && r.date === date);
    if (existing) {
      existing.msKL = msKL;
      existing.hsdKL = hsdKL;
    } else {
      store.salesRecords.push({ outletId: outlet.id, date, msKL, hsdKL, source: "CRIS" });
    }
    applied++;
  }
  if (applied > 0) persistSales();
  return { rowsRead: rows.length, rowsApplied: applied, warnings };
}

export function uploadStockSnapshot(fileName: string, opts: { text?: string; base64?: string }): UploadResult {
  const { header, rows } = parseUpload(fileName, opts.text, opts.base64);
  const warnings: string[] = [];
  let applied = 0;

  for (const [i, row] of rows.entries()) {
    const sapCode = String(cellByHeader(header, row, "SAP Code") ?? "").trim();
    const product = String(cellByHeader(header, row, "Product") ?? "").trim();
    const stockDate = String(cellByHeader(header, row, "Stock Date") ?? "").trim();
    const capacityLtr = Number(cellByHeader(header, row, "Capacity (Ltr)") ?? 0);
    const stockQtyLtr = Number(cellByHeader(header, row, "Stock Qty (Ltr)") ?? 0);
    const pumpableStockLtr = Number(cellByHeader(header, row, "Pumpable Stock (Ltr)") ?? 0);
    const ullageLtr = Number(cellByHeader(header, row, "Ullage (Ltr)") ?? 0);
    if (!sapCode || !product || !stockDate) {
      warnings.push(`Row ${i + 2}: missing SAP Code, Product or Stock Date — skipped.`);
      continue;
    }
    const outlet = findOutletBySap(sapCode);
    if (!outlet) {
      warnings.push(`Row ${i + 2}: no outlet found for SAP Code ${sapCode} — skipped.`);
      continue;
    }
    const existing = store.stockSnapshots.find((r) => r.outletId === outlet.id && r.product === product && r.stockDate === stockDate);
    if (existing) {
      existing.capacityLtr = capacityLtr;
      existing.stockQtyLtr = stockQtyLtr;
      existing.pumpableStockLtr = pumpableStockLtr;
      existing.ullageLtr = ullageLtr;
    } else {
      store.stockSnapshots.push({ outletId: outlet.id, product, stockDate, capacityLtr, stockQtyLtr, pumpableStockLtr, ullageLtr, source: "CRIS" });
    }
    applied++;
  }
  if (applied > 0) persistStock();
  return { rowsRead: rows.length, rowsApplied: applied, warnings };
}
