/**
 * PA Outlets domain model.
 *
 * Source: "18.07.2026 PA Outlets" workbook — a nationwide HPCL retail outlet
 * roster (4,928 outlets, 16 zones, 73 regions, 340 sales areas) with FY
 * 2025-26 actual and FY 2026-27 planned MS/HSD throughput per outlet.
 *
 * `msDeltaKlpm` / `hsdDeltaKlpm` in the source are already the *monthly*
 * incremental throughput the plan implies, i.e. (next-year KL - this-year
 * KL) / 12 — carried through as-is rather than recomputed.
 */

export type Zone = string;
export type Region = string;
export type SalesArea = string;

/** Outlet ownership/operation format, as recorded in the source (CO = Company Owned, CL = Company Leased, DO = Dealer Owned). */
export type OutletType = "CO-100" | "CO-COCO" | "CO-COMCO" | "CL-119" | "DO-120";

export const CLASSES_OF_MARKET = ["Class A", "Class B", "Class C", "Class D(NH)", "Class D(SH)", "Class E"] as const;
export type ClassOfMarket = (typeof CLASSES_OF_MARKET)[number];

export type SocialCategory = "OPEN" | "SC" | "ST" | "OBC";

/** Outlet-age buckets used throughout the aggregation model. */
export const AGE_BRACKETS = ["0-5 yrs", "5-10 yrs", "10-20 yrs", "20-30 yrs", "30+ yrs"] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

export interface PAOutlet {
  serialNo: number;
  zone: Zone;
  state: string;
  region: Region;
  salesArea: SalesArea;
  outletName: string;
  customerCode: string;
  mrnNo: string;
  type: OutletType;
  classOfMarket: ClassOfMarket;
  socialCategory: SocialCategory;
  /** Abyuday 1.0 (rural LPG-linked outlet scheme) enrolment; null where the source left it blank. */
  abyuday: boolean | null;
  /** Freeform in the source: a route number ("NH44", "SH-12"), or "Rural"/"Urban"/"NA". */
  nhShNo: string | null;
  /** ISO date (YYYY-MM-DD) the outlet was commissioned. */
  commDate: string;
  msKl2526: number; // MS actual, FY 2025-26, KL/year
  hsdKl2526: number; // HSD actual, FY 2025-26, KL/year
  msKl2627: number; // MS plan, FY 2026-27, KL/year
  hsdKl2627: number; // HSD plan, FY 2026-27, KL/year
  keyActions: string | null;
  msDeltaKlpm: number; // planned monthly MS throughput increase
  hsdDeltaKlpm: number; // planned monthly HSD throughput increase
}

/** A PAOutlet plus age derived as of some reference date (see loadData.ts). */
export interface PAOutletWithAge extends PAOutlet {
  ageYears: number;
  ageBracket: AgeBracket;
}

export interface DeltaTotals {
  outletCount: number;
  msKl2526: number;
  hsdKl2526: number;
  msKl2627: number;
  hsdKl2627: number;
  msDeltaKlpm: number;
  hsdDeltaKlpm: number;
  avgMsDeltaKlpm: number;
  avgHsdDeltaKlpm: number;
}

/** Totals for one group (a zone, a region, a sales area, ...), broken down by Class of Market and by age bracket. */
export interface GroupSummary extends DeltaTotals {
  key: string;
  byClassOfMarket: Partial<Record<ClassOfMarket, DeltaTotals>>;
  byAgeBracket: Partial<Record<AgeBracket, DeltaTotals>>;
}

export interface ZoneSummary extends GroupSummary {
  zone: Zone;
}

export interface RegionSummary extends GroupSummary {
  zone: Zone;
  region: Region;
}

export interface SalesAreaSummary extends GroupSummary {
  zone: Zone;
  region: Region;
  salesArea: SalesArea;
}
