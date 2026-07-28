# PA Outlets model

TypeScript data model for the `18.07.2026_PA_Outlets_.xlsx` workbook: a
nationwide HPCL retail outlet roster (**4,928 outlets** across **16 zones**,
**73 regions** and **340 sales areas**) with FY 2025-26 actual and FY 2026-27
planned MS/HSD throughput per outlet.

Standalone by design — it does not import from or wire into `src/`, and
`src/` does not depend on it.

## Files

| File | Purpose |
|---|---|
| `types.ts` | Domain types: `PAOutlet`, `PAOutletWithAge`, and the summary shapes (`GroupSummary`, `ZoneSummary`, `RegionSummary`, `SalesAreaSummary`). |
| `data/outlets.json` | The cleaned dataset (see "Data cleaning" below). |
| `loadData.ts` | Loads `data/outlets.json`; derives `ageYears`/`ageBracket` from `commDate` as of any reference date. |
| `aggregate.ts` | `summarizeByZone`, `summarizeByRegion(outlets, zone?)`, `summarizeBySalesArea(outlets, region?)`, `summarizeAll`, `crossTabClassByAge` — every summary is broken down by Class of Market and by age bracket. |
| `report.ts` | Sample CLI report exercising the model end to end. |

## Running it

```bash
npx tsc -p PA/tsconfig.json
node PA/dist/report.js
```

(Needs the root `devDependencies` — `typescript`, `@types/node` — installed once via `npm install` at the repo root.)

## Model shape

```ts
interface PAOutlet {
  zone: string; state: string; region: string; salesArea: string;
  outletName: string; customerCode: string; mrnNo: string;
  type: "CO-100" | "CO-COCO" | "CO-COMCO" | "CL-119" | "DO-120";
  classOfMarket: "Class A" | "Class B" | "Class C" | "Class D(NH)" | "Class D(SH)" | "Class E";
  socialCategory: "OPEN" | "SC" | "ST" | "OBC";
  abyuday: boolean | null;
  nhShNo: string | null;
  commDate: string; // ISO date — outlet age is derived from this
  msKl2526: number; hsdKl2526: number;   // FY25-26 actual, KL/year
  msKl2627: number; hsdKl2627: number;   // FY26-27 plan, KL/year
  msDeltaKlpm: number; hsdDeltaKlpm: number; // planned monthly incremental throughput
  keyActions: string | null;
}
```

Age brackets (`AGE_BRACKETS` in `types.ts`): `0-5 yrs`, `5-10 yrs`,
`10-20 yrs`, `20-30 yrs`, `30+ yrs` — chosen to separate a network that spans
outlets commissioned in 1959 through outlets commissioned this month.

Every `GroupSummary` (zone, region, sales area, or the all-India total from
`summarizeAll`) carries `byClassOfMarket` and `byAgeBracket` breakdowns, so
"zone-wise / region-wise / sales-area-wise, considering age of outlet and
class of market" is one consistent shape at every level — plus
`crossTabClassByAge` for the national Class-of-Market x age-bracket view.

## Data cleaning applied when building `data/outlets.json`

The source sheet ("Sheet1" / raw data tab, not the pivot) was entered by
many regional teams, so free-text fields carry inconsistent
casing/whitespace. Cleaning was limited to normalization — no values were
invented or dropped:

- **Zone**: trimmed; `SOUTH CENTRAL ZONE` (45 rows) merged into
  `South Central Zone` (its 538-row case-correct twin) — 17 raw spellings
  become 16 real zones.
- **Type, Class of Market, Social Category**: trimmed and case-normalized to
  the canonical forms above (e.g. `Co-100`/`CO-100 ` → `CO-100`, `class B` →
  `Class B`, `open`/`Open` → `OPEN`).
- **Abyuday**: `Yes`/`YES`/`yes` → `true`, `No`/`NO`/`no` → `false`, blank →
  `null` (25 rows).
- **Comm Date**: converted from the Excel 1900-epoch serial to an ISO date.
- **MS/HSD Delta KLPM**: carried through as given in the source — verified
  against `(next-year KL − this-year KL) / 12` on sample rows.

`ZONE`, `REGION`, `SALES AREA`, `NH/SH No` are otherwise freeform strings
exactly as recorded in the source (73 regions and 340 sales areas are not
enumerated as literal types — there are too many, and new ones get added by
the business, so they're modelled as `string`).
