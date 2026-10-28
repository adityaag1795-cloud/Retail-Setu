import type { OutletCriticalityMonitor } from "../types.js";

/**
 * Real data from HPCL's own "Outlet Criticality Monitor" workbook (uploaded 22-07-2026) — whether
 * each outlet is dry (or intraday-dry) in MS/HSD, whether an indent has been placed, and whether
 * funds are available to cover it. Covers the same 11 outlets already curated into this prototype
 * — mapped here by outlet ID (the workbook's own outlet-name spellings differ slightly from the
 * master sheet's, e.g. "Paawan Filling Station" vs the master sheet's "Paawan Filliing Station").
 */
export const SEED_OUTLET_CRITICALITY: OutletCriticalityMonitor[] = [
  { outletId: "OUT-41007896", dryMS: true, dryMSIntraday: true, dryHSD: true, dryHSDIntraday: true, indentPlaced: true, fundsAvailable: true, criticality: "HIGH" }, // HP Laxmi Filling Station
  { outletId: "OUT-41010178", dryMS: false, dryMSIntraday: true, dryHSD: false, dryHSDIntraday: true, indentPlaced: true, fundsAvailable: false, criticality: "LOW" }, // HP Om Sai Ram Oil Company
  { outletId: "OUT-41014421", dryMS: false, dryMSIntraday: true, dryHSD: false, dryHSDIntraday: true, indentPlaced: true, fundsAvailable: true, criticality: "HIGH" }, // Gayatri Filling Station
  { outletId: "OUT-41014439", dryMS: false, dryMSIntraday: false, dryHSD: false, dryHSDIntraday: false, indentPlaced: true, fundsAvailable: true, criticality: "LOW" }, // HP Ellar Filling Station
  { outletId: "OUT-41015064", dryMS: false, dryMSIntraday: true, dryHSD: false, dryHSDIntraday: true, indentPlaced: false, fundsAvailable: false, criticality: "LOW" }, // HP Kalra Filling Station
  { outletId: "OUT-41027708", dryMS: false, dryMSIntraday: false, dryHSD: false, dryHSDIntraday: false, indentPlaced: true, fundsAvailable: false, criticality: "MEDIUM" }, // Paawan Filliing Station
  { outletId: "OUT-41028014", dryMS: true, dryMSIntraday: true, dryHSD: true, dryHSDIntraday: true, indentPlaced: false, fundsAvailable: false, criticality: "LOW" }, // Shiva Cares
  { outletId: "OUT-41056574", dryMS: false, dryMSIntraday: false, dryHSD: false, dryHSDIntraday: false, indentPlaced: true, fundsAvailable: true, criticality: "HIGH" }, // Sunder Service Station
  { outletId: "OUT-41056955", dryMS: true, dryMSIntraday: true, dryHSD: false, dryHSDIntraday: false, indentPlaced: true, fundsAvailable: false, criticality: "MEDIUM" }, // The Auto Supply Company
  { outletId: "OUT-41056957", dryMS: false, dryMSIntraday: false, dryHSD: true, dryHSDIntraday: true, indentPlaced: false, fundsAvailable: true, criticality: "HIGH" }, // Raj Auto Service
  { outletId: "OUT-41068065", dryMS: true, dryMSIntraday: true, dryHSD: false, dryHSDIntraday: false, indentPlaced: true, fundsAvailable: true, criticality: "MEDIUM" }, // HP Service Centre - Faridabad
];
