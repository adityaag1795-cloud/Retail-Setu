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
import type { Outlet, DailyTrafficSummary, NozzleActivity, VehicleType, VehicleTypeCount } from "../types.js";
import { store } from "../store.js";
import { parseXlsxFirstSheet, parseXlsxAllRows, parseCsv, cellByHeader, type ParsedSheet } from "./xlsxReader.js";
import { classifyVehicle } from "./trafficAnalytics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data", "uploads");
const SALES_FILE = path.join(DATA_DIR, "sales.json");
const STOCK_FILE = path.join(DATA_DIR, "stock.json");
const TRAFFIC_FILE = path.join(DATA_DIR, "traffic.json");
const NOZZLES_FILE = path.join(DATA_DIR, "nozzles.json");

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
  try {
    if (existsSync(TRAFFIC_FILE)) store.dailyTraffic = JSON.parse(readFileSync(TRAFFIC_FILE, "utf-8"));
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(NOZZLES_FILE)) store.nozzleActivity = JSON.parse(readFileSync(NOZZLES_FILE, "utf-8"));
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

function persistTraffic() {
  ensureDataDir();
  writeFileSync(TRAFFIC_FILE, JSON.stringify(store.dailyTraffic, null, 2));
  writeFileSync(NOZZLES_FILE, JSON.stringify(store.nozzleActivity, null, 2));
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

const VEHICLE_TYPES: VehicleType[] = ["TwoWheeler", "FourWheeler", "HMV", "BowserSupply"];
function emptyVehicleCount(): VehicleTypeCount {
  return { transactions: 0, volumeKL: 0, amountRs: 0 };
}

/**
 * Real DU/RELCON automation "Transaction Report Details" export — a fixed layout (not the
 * generic header-in-row-1 template): row 2 carries "RO SAP Code:", the real column header row is
 * further down (wherever "Transaction Date & Time" appears), and a totals row follows the last
 * transaction. Re-uploading for an outlet replaces its previously-derived traffic data (these
 * vendor exports are always a full date-range pull, not a delta).
 */
export function uploadTransactionReport(fileName: string, opts: { base64?: string }): UploadResult {
  if (!opts.base64) throw new DataUploadError("Transaction report upload requires the .xlsx file (base64)");
  const buf = Buffer.from(opts.base64, "base64");
  const allRows = parseXlsxAllRows(buf);
  const warnings: string[] = [];

  const sapRow = allRows.find((r) => String(r[0] ?? "").trim() === "RO SAP Code:");
  const sapCode = sapRow ? String(sapRow[1] ?? "").trim() : "";
  if (!sapCode) throw new DataUploadError('Could not find "RO SAP Code:" in the uploaded report');
  const outlet = findOutletBySap(sapCode);
  if (!outlet) throw new DataUploadError(`No outlet found for SAP Code ${sapCode}`);

  const headerRowIdx = allRows.findIndex((r) => r.some((c) => String(c ?? "").trim() === "Transaction Date & Time"));
  if (headerRowIdx === -1) throw new DataUploadError('Could not find the "Transaction Date & Time" header row in the uploaded report');
  const header = allRows[headerRowIdx]!.map((c) => String(c ?? "").trim());
  const dataRows = allRows.slice(headerRowIdx + 1);

  const dayMap = new Map<string, DailyTrafficSummary>();
  const nozzleMap = new Map<string, { pumpNo: string; nozzleNo: string; count: number; first: Date; last: Date }>();
  let applied = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const dtRaw = cellByHeader(header, row, "Transaction Date & Time");
    if (!dtRaw) continue; // blank rows, and the trailing totals row (no date), both fall through here
    const amount = Number(cellByHeader(header, row, "Amount(Rs.)") ?? 0);
    if (!amount || amount <= 0) {
      skipped++;
      continue;
    }
    const dt = new Date(String(dtRaw));
    if (Number.isNaN(dt.getTime())) {
      skipped++;
      continue;
    }
    const dateStr = String(dtRaw).slice(0, 10);
    const product = String(cellByHeader(header, row, "Product") ?? "").trim();
    const volumeKL = Number(cellByHeader(header, row, "Volume(Ltrs.)") ?? 0) / 1000;
    const pumpNo = String(cellByHeader(header, row, "Pump No") ?? "").trim();
    const nozzleNo = String(cellByHeader(header, row, "Nozzle No") ?? "").trim();
    const vt = classifyVehicle(amount);

    let day = dayMap.get(dateStr);
    if (!day) {
      day = {
        outletId: outlet.id,
        date: dateStr,
        byVehicleType: { TwoWheeler: emptyVehicleCount(), FourWheeler: emptyVehicleCount(), HMV: emptyVehicleCount(), BowserSupply: emptyVehicleCount() },
        byProduct: {},
        hourlyTransactionCounts: new Array(24).fill(0),
      };
      dayMap.set(dateStr, day);
    }
    const vtc = day.byVehicleType[vt];
    vtc.transactions += 1;
    vtc.volumeKL += volumeKL;
    vtc.amountRs += amount;
    const pc = day.byProduct[product] ?? emptyVehicleCount();
    pc.transactions += 1;
    pc.volumeKL += volumeKL;
    pc.amountRs += amount;
    day.byProduct[product] = pc;
    day.hourlyTransactionCounts[dt.getHours()] = (day.hourlyTransactionCounts[dt.getHours()] ?? 0) + 1;

    const key = `${pumpNo}-${nozzleNo}`;
    const ns = nozzleMap.get(key) ?? { pumpNo, nozzleNo, count: 0, first: dt, last: dt };
    ns.count += 1;
    if (dt < ns.first) ns.first = dt;
    if (dt > ns.last) ns.last = dt;
    nozzleMap.set(key, ns);

    applied++;
  }

  if (applied === 0) throw new DataUploadError("No valid transactions found in the uploaded report");

  const maxLast = new Date(Math.max(...[...nozzleMap.values()].map((n) => n.last.getTime())));
  const INACTIVITY_THRESHOLD_DAYS = 3;
  const nozzleActivity: NozzleActivity[] = [...nozzleMap.values()].map((n) => ({
    outletId: outlet.id,
    pumpNo: n.pumpNo,
    nozzleNo: n.nozzleNo,
    transactionCount: n.count,
    firstTransactionAt: n.first.toISOString(),
    lastTransactionAt: n.last.toISOString(),
    possiblyInactive: (maxLast.getTime() - n.last.getTime()) / 86400000 > INACTIVITY_THRESHOLD_DAYS,
  }));

  for (const day of dayMap.values()) {
    for (const vt of VEHICLE_TYPES) {
      const c = day.byVehicleType[vt];
      c.volumeKL = Math.round(c.volumeKL * 1000) / 1000;
      c.amountRs = Math.round(c.amountRs * 100) / 100;
    }
    for (const c of Object.values(day.byProduct)) {
      c.volumeKL = Math.round(c.volumeKL * 1000) / 1000;
      c.amountRs = Math.round(c.amountRs * 100) / 100;
    }
  }

  store.dailyTraffic = store.dailyTraffic.filter((d) => d.outletId !== outlet.id).concat([...dayMap.values()]);
  store.nozzleActivity = store.nozzleActivity.filter((n) => n.outletId !== outlet.id).concat(nozzleActivity);
  persistTraffic();

  if (skipped > 0) warnings.push(`${skipped} row(s) skipped (zero-amount void/test swipes or unparseable date).`);
  return { rowsRead: dataRows.length, rowsApplied: applied, warnings };
}
