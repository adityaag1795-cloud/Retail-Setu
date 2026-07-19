import type {
  Outlet,
  SalesRecord,
  TankStock,
  Communication,
  TeamMember,
  PolicyClause,
  DealerCase,
  DealerRequest,
} from "../types.js";

/**
 * SEED DATA.
 *
 * IMPORTANT: the documents supplied for this prototype (Kalka Sales/Nacholi
 * feasibility-LEC-IRR-lease-Dealership Agreement file, the Gayatri Filling
 * Station resitement file, the Roopendra "Approved File Note", the Faridabad
 * SA backup workbook, the SAP FAIL export, the real Resitement/CFS/EAM
 * policy circulars) are used ONLY as *reference formats* — they tell the AI
 * engine (`services/aiEngine.ts`) and the type model (`types.ts`) what a
 * real master sheet, application form, LEC, file note, lease deed,
 * Dealership Agreement, RBC budget note etc. actually look like.
 *
 * They are deliberately NOT replayed here as finished, pre-built Module 2
 * "cases" — this is a live system, not a set of worked examples. Module 2
 * starts with zero cases (`seedDealerCases = []`): a Sales Officer opens a
 * new-site-development or resitement case through the UI for whatever real
 * outlet/situation they're working on, and every document (feasibility
 * report, file note, LOI, budget note, lease, Dealership Agreement) is
 * generated fresh, in the real format, from what they enter.
 *
 * What IS carried over as real reference data (because these are factual
 * records, not fabricated workflow outcomes):
 *   - the four outlets below and their master-sheet columns, fixed assets
 *     and sales benchmarks (real HPCL Faridabad SA master data), and
 *   - the policy clauses in the Knowledge Centre (real circulars, meant to
 *     be cited as-is).
 * Names, figures and dates are reproduced from the source documents where
 * known; anything not present in the source material is left blank rather
 * than invented.
 */

const SALES_AREA = "Faridabad SA";

function iso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Module 1 — Outlets (real, from the Faridabad SA backup workbook)
// ---------------------------------------------------------------------------

// Master-sheet field names below mirror the real "DEALER AGREEMENT DETAILS" columns
// from the Faridabad/Gurgaon Region dealerwise master workbook (Customer No, SAP Code,
// Date of Comm., Dealership Name, Address, District, New SA, Class of Market, Type of
// Land, Category, Year/Month of Commissioning, Name of Dealer, Landlord, etc.) — this is
// the real Module 1 "Master Sheet" format. Fields left blank aren't in the source data.
export const seedOutlets: Outlet[] = [
  {
    id: "OUT-41014874",
    name: "HP Manu Fuels",
    salesArea: SALES_AREA,
    district: "Faridabad",
    company: "HPCL",
    status: "Operational",
    location: { lat: 28.386, lng: 77.309 },
    masterSheet: {
      "Customer No.": "16603430",
      "SAP Code": "41014874",
      "Dealership Name": "HP Manu Fuels",
      District: "Faridabad",
      "New SA": SALES_AREA,
      "Class of Market": "",
      "Type of Land": "",
      "Category (SC/ST/OPEN/DEF/OVS/PH)": "SC",
      "Year of Commissioning": "2008-2009",
      "Whether Junction/Model/Urban/Rural": "Urban",
    },
    fixedAssets: [],
    taAverageKL: 135,
    canopy: true,
    nozzleSalesStarted: true,
    commissionedDate: "2008-06-01",
  },
  {
    id: "OUT-41056574",
    name: "Sunder Service Station",
    salesArea: SALES_AREA,
    district: "Faridabad",
    company: "HPCL",
    status: "Operational",
    location: { lat: 28.402, lng: 77.316 },
    masterSheet: {
      "Customer No.": "11891040",
      "SAP Code": "41056574",
      "Dealership Name": "Sunder Service Station",
      District: "Faridabad",
      "New SA": SALES_AREA,
      "Class of Market": "",
      "Type of Land": "",
      "Year of Commissioning": "1967-1968",
      "Whether Junction/Model/Urban/Rural": "Urban",
    },
    // Real SAP FAIL (Fixed Asset Individual Listing) row for this customer code.
    fixedAssets: [
      {
        id: "FA-100000520",
        outletId: "OUT-41056574",
        assetClassDescription: "Freehold Land",
        assetDescription: "LAND-FREEHOLD/LAND FREEHOLD",
        grossBlock: 35354.0,
        depreciationReserve: 0,
        netBookValue: 35354.0,
        usefulLifeYears: 0,
        capitalizedOn: "1963-12-01", // Excel serial 23346
      },
    ],
    taAverageKL: 1150,
    canopy: true,
    nozzleSalesStarted: true,
    commissionedDate: "1968-01-01",
  },
  {
    id: "OUT-41075523",
    name: "HP Kalka Sales",
    salesArea: SALES_AREA,
    district: "Faridabad",
    company: "HPCL",
    status: "Operational",
    location: { lat: 28.39, lng: 77.31 },
    masterSheet: {
      "Customer No.": "41075523",
      "SAP Code": "41075523",
      "Dealership Name": "HP Kalka Sales",
      District: "Faridabad",
      "New SA": SALES_AREA,
      "Class of Market": "B",
      "Type of Land": "CL",
      "Category (SC/ST/OPEN/DEF/OVS/PH)": "",
      "Year of Commissioning": "2024-2025",
      "Whether Junction/Model/Urban/Rural": "Rural",
    },
    fixedAssets: [],
    taAverageKL: 244, // 2nd-year TA potential per the real Nacholi-stretch feasibility format (MS 136.5 + HSD 108.2)
    canopy: false,
    nozzleSalesStarted: true,
    commissionedDate: "2025-01-01",
  },
  {
    id: "OUT-41014421",
    name: "Gayatri Filling Station",
    salesArea: SALES_AREA,
    district: "Faridabad",
    company: "HPCL",
    status: "Operational",
    dealerName: "Kavita Adhana (Proprietor)",
    location: { lat: 28.35, lng: 77.28 }, // Village Mohna
    masterSheet: {
      "Customer No.": "41014421",
      "SAP Code": "41014421",
      "Dealership Name": "Gayatri Filling Station",
      Address: "Village Mohna",
      District: "Faridabad",
      "New SA": SALES_AREA,
      "Class of Market": "E",
      "Type of Land": "CL",
      "Name of the Dealer": "Kavita Adhana",
      Landlord: "Tara Chand",
      "Year of Commissioning": "2005",
      "Date of Expiry of Lease": "2024-05-31",
    },
    fixedAssets: [
      {
        id: "FA-GAYATRI-DU",
        outletId: "OUT-41014421",
        assetClassDescription: "RTU L/H Land",
        assetDescription: "Gayatri Filling Station — leasehold land & dispensing infrastructure",
        grossBlock: 596537.51,
        depreciationReserve: 168831.37,
        netBookValue: 419264.57,
        usefulLifeYears: 8,
        capitalizedOn: "2005-04-01",
      },
    ],
    // Real last-5-year volume trend: the outlet's sales have collapsed (5 KL MS / 15 KL HSD in
    // 2025-26 vs 407/425 the year before) since its land lease lapsed — a real, live predictive
    // analytics signal (see Module 3), independent of any Module 2 case being open on it.
    taAverageKL: 60,
    canopy: false,
    nozzleSalesStarted: true,
    commissionedDate: "2005-04-01",
  },
];

// Real day-wise nozzle sales for Sunder Service Station (SAP 41056574), 01-18 Jul 2026, from the
// live CRIS "Nozzle Sales vs SAP Receipt" report (generated 18-07-2026). That feed reports total
// litres/day, not an MS/HSD split, so the split below is estimated using the outlet's real
// MS:HSD product mix (14.5:25.0, i.e. 36.71%/63.29% — see `patterns` below); the daily *total*
// volume is real, including the two genuine dry days (10 & 18 Jul) reported in the feed.
const sunderRealDailyOverrides: { date: string; msKL: number; hsdKL: number }[] = [
  { date: "2026-07-01", msKL: 4.931, hsdKL: 8.501 },
  { date: "2026-07-02", msKL: 4.799, hsdKL: 8.274 },
  { date: "2026-07-03", msKL: 5.215, hsdKL: 8.991 },
  { date: "2026-07-04", msKL: 4.737, hsdKL: 8.167 },
  { date: "2026-07-05", msKL: 3.904, hsdKL: 6.73 },
  { date: "2026-07-06", msKL: 4.9, hsdKL: 8.448 },
  { date: "2026-07-07", msKL: 4.361, hsdKL: 7.518 },
  { date: "2026-07-08", msKL: 4.653, hsdKL: 8.022 },
  { date: "2026-07-09", msKL: 2.934, hsdKL: 5.059 },
  { date: "2026-07-10", msKL: 0, hsdKL: 0 },
  { date: "2026-07-11", msKL: 0.772, hsdKL: 1.331 },
  { date: "2026-07-12", msKL: 3.937, hsdKL: 6.788 },
  { date: "2026-07-13", msKL: 5.414, hsdKL: 9.334 },
  { date: "2026-07-14", msKL: 4.99, hsdKL: 8.604 },
  { date: "2026-07-15", msKL: 5.366, hsdKL: 9.251 },
  { date: "2026-07-16", msKL: 4.861, hsdKL: 8.381 },
  { date: "2026-07-17", msKL: 4.787, hsdKL: 8.253 },
  { date: "2026-07-18", msKL: 0, hsdKL: 0 },
];

// Daily "CRIS" sales feed. Monthly benchmarks are grounded in the real
// figures above; a daily series is synthesised around them since the source
// documents only carried monthly totals — except Sunder Service Station's
// 01-18 Jul 2026 window, which is overwritten with the real feed above.
export const seedSalesRecords: SalesRecord[] = (() => {
  const records: SalesRecord[] = [];
  const patterns: Record<string, { msBase: number; hsdBase: number; dryEvery?: number }> = {
    "OUT-41014874": { msBase: 4.0, hsdBase: 3.2 }, // ~120 KL MS / ~95 KL HSD per month
    "OUT-41056574": { msBase: 14.5, hsdBase: 25.0 }, // real 2024-25 avg ~435 KL MS / ~750 KL HSD
    "OUT-41075523": { msBase: 2.7, hsdBase: 2.2 }, // ramping first-year volume per the real IRR model
    // Gayatri: real 2025-26 collapse (5 KL MS / 15 KL HSD across Apr-Nov) — outlet is effectively dry.
    "OUT-41014421": { msBase: 0.2, hsdBase: 0.5, dryEvery: 3 },
  };
  for (let day = 59; day >= 0; day--) {
    const date = iso(day);
    for (const [outletId, p] of Object.entries(patterns)) {
      const isDry = p.dryEvery ? day % p.dryEvery === 0 : false;
      const noise = () => 0.85 + Math.random() * 0.3;
      records.push({
        outletId,
        date,
        msKL: isDry ? 0 : Number((p.msBase * noise()).toFixed(2)),
        hsdKL: isDry ? 0 : Number((p.hsdBase * noise()).toFixed(2)),
        source: "CRIS",
      });
    }
  }
  for (const o of sunderRealDailyOverrides) {
    const rec = records.find((r) => r.outletId === "OUT-41056574" && r.date === o.date);
    if (rec) {
      rec.msKL = o.msKL;
      rec.hsdKL = o.hsdKL;
    }
  }
  return records;
})();

// Real tank-level stock/ullage snapshot from the live SAP "Stock Ullage Report" feed, as at
// 18-07-2026 (today). Gayatri Filling Station (OUT-41014421) has no row here because its
// lease lapsed and the outlet is off the live SAP feed — consistent with its Module 3 story.
export const seedStockSnapshots: TankStock[] = [
  { outletId: "OUT-41056574", product: "HSD", stockDate: "2026-07-18", capacityLtr: 115000, stockQtyLtr: 95757.4, pumpableStockLtr: 88282, ullageLtr: 19242.6, source: "CRIS" },
  { outletId: "OUT-41056574", product: "MS", stockDate: "2026-07-18", capacityLtr: 70000, stockQtyLtr: 50747.1, pumpableStockLtr: 43267, ullageLtr: 19252.9, source: "CRIS" },
  { outletId: "OUT-41056574", product: "POWER 95", stockDate: "2026-07-18", capacityLtr: 16000, stockQtyLtr: 13913.3, pumpableStockLtr: 12153, ullageLtr: 2086.7, source: "CRIS" },
  // HP Manu Fuels — critically low: MS pump stock 150 L, POWER 95 pumpable stock is 0 (dry today).
  { outletId: "OUT-41014874", product: "HSD", stockDate: "2026-07-18", capacityLtr: 45042, stockQtyLtr: 4371.0, pumpableStockLtr: 1443, ullageLtr: 40671.0, source: "CRIS" },
  { outletId: "OUT-41014874", product: "MS", stockDate: "2026-07-18", capacityLtr: 22000, stockQtyLtr: 2349.8, pumpableStockLtr: 150, ullageLtr: 19650.2, source: "CRIS" },
  { outletId: "OUT-41014874", product: "POWER 95", stockDate: "2026-07-18", capacityLtr: 23947, stockQtyLtr: 2341.1, pumpableStockLtr: 0, ullageLtr: 21606.0, source: "CRIS" },
  { outletId: "OUT-41075523", product: "HSD", stockDate: "2026-07-18", capacityLtr: 35000, stockQtyLtr: 7052.6, pumpableStockLtr: 4428, ullageLtr: 27947.4, source: "CRIS" },
  { outletId: "OUT-41075523", product: "MS", stockDate: "2026-07-18", capacityLtr: 22000, stockQtyLtr: 3465.8, pumpableStockLtr: 1266, ullageLtr: 18534.2, source: "CRIS" },
  { outletId: "OUT-41075523", product: "POWER 95", stockDate: "2026-07-18", capacityLtr: 16000, stockQtyLtr: 4582.0, pumpableStockLtr: 2822, ullageLtr: 11418.0, source: "CRIS" },
];

export const seedCommunications: Communication[] = [
  {
    id: "COMM-GAYATRI-RESITEMENT-REQUEST",
    outletId: "OUT-41014421",
    date: "2025-09-01",
    direction: "Inbound",
    channel: "Letter",
    subject: "Request for Resitement of Dealership — M/s Gayatri Filling Station",
    summary:
      "Kavita Adhana (Proprietor) reports the head lease with landowner Tara Chand expired 31.05.2024; landowner and villagers blocked supply on 05.04.2025 and refused renewal. Police unable to assist once the expired deed was produced. Requests resitement under HPCL's Resitement Policy to an alternate site at Rao Farms, Faridpur, Sector 78/99. Police complaint acknowledgment enclosed.",
    pdfRecordName: "OUT-41014421_resitement_request.pdf",
    scanCopy: true,
  },
  {
    id: "COMM-GAYATRI-LEGAL-OPINION",
    outletId: "OUT-41014421",
    date: "2026-04-30",
    direction: "Inbound",
    channel: "Letter",
    subject: "Supplementary Legal Report — Tenancy Protection, Rental Liability & Judicial Remedies",
    summary:
      "Advocate Sandeep Yadav (Distt. Courts, Gurgaon) opines that the Haryana Urban (Control of Rent & Eviction) Act, 1973 does not cover vacant land; the lease is governed by the Transfer of Property Act, 1882. No statutory tenancy protection or holding-over right is available to HPCL since the landowner has already dispossessed the dealership and declines to accept rent. Judicial remedies are limited to interim protection against forcible dispossession; continued occupation risks mesne-profits claims.",
    pdfRecordName: "OUT-41014421_supplementary_legal_opinion.pdf",
    scanCopy: false,
  },
  {
    id: "COMM-KALKA-CANOPY-COMMITMENT",
    outletId: "OUT-41075523",
    date: iso(40),
    direction: "Inbound",
    channel: "Letter",
    subject: "Dealer Commitment — request cum commitment proposal for canopy addition",
    summary:
      "Dealer commits to achieving and maintaining 150 KL/month MS and 130 KL/month HSD sales at HP Kalka Sales in support of the canopy addition request.",
    pdfRecordName: "OUT-41075523_dealer_commitment.pdf",
    scanCopy: true,
  },
  {
    id: "COMM-KALKA-LAND-AFFIDAVIT",
    outletId: "OUT-41075523",
    date: iso(310),
    direction: "Inbound",
    channel: "Scan",
    subject: "Notarized affidavit — land offer from landowner (Appendix III)",
    summary:
      "Landowners' notarized affidavit offering land on lease for the retail outlet: Rs. 2,50,000/month rent with 5% escalation every 3 years, 30-year lease term.",
    pdfRecordName: "OUT-41075523_land_offer_affidavit.pdf",
    scanCopy: true,
  },
];

// ---------------------------------------------------------------------------
// Module 4 — Team (real names from the routing chain of the Roopendra file
// note and the Nacholi feasibility report signature).
// ---------------------------------------------------------------------------

export const seedTeam: TeamMember[] = [
  { id: "TM-SO-ABHISHEK", name: "Abhishek Pratap Singh (Sr. Area Sales Manager, Retail-Faridabad)", role: "SO", salesArea: SALES_AREA },
  { id: "TM-RO-VENUGOPAL", name: "Medikonda Venu Gopal (DGM, Retail Region)", role: "RO", salesArea: SALES_AREA },
  { id: "TM-RO-DEVENDRA", name: "Devendra Dev Sharma (GM, Network Planning)", role: "RO", salesArea: SALES_AREA },
  { id: "TM-HEAD-AVINASH", name: "Avinash Jain (Chief General Manager, Retail)", role: "RetailHead", salesArea: SALES_AREA },
  { id: "TM-DEALER-KAVITA", name: "Kavita Adhana (Dealer, Gayatri Filling Station)", role: "Dealer", salesArea: SALES_AREA },
];

// ---------------------------------------------------------------------------
// Module 6 — Knowledge Centre (verbatim clauses from real HPCL circulars)
// ---------------------------------------------------------------------------

export const seedPolicyClauses: PolicyClause[] = [
  {
    id: "POL-RESITE-1.1f",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(f)",
    heading: "Ground for resitement — no enforceable right to continue on site",
    text:
      "Where Corporation is unable to obtain legal redress to enable it to continue on the site and the legal department of the Corporation confirms (i) Corporation has no registered/valid lease/option available for the site, (ii) Corporation has no protection under any local tenancy and other Acts.",
    tags: ["resitement", "lease", "tenancy", "legal"],
  },
  {
    id: "POL-RESITE-1.1a",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(a)",
    heading: "Ground for resitement — road changes",
    text:
      "Road widening, diversion of road, realignment of existing road by a new one, road closure, closure/diversion of a particular traffic to the area, and any road related incidents beyond the control of dealer viz. shifting of octroi post etc.",
    tags: ["resitement", "road", "viability"],
  },
  {
    id: "POL-RESITE-1.1b",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(b)",
    heading: "Ground for resitement — inter-state tax disparity",
    text:
      "Increase in disparity in State Taxes leading to rendering ROs located at Inter-State border areas unviable. For this purpose, viability will be minimum 100 KL per month combined potential of MS & HSD.",
    tags: ["resitement", "tax", "viability", "border"],
  },
  {
    id: "POL-RESITE-1.1c",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(c)",
    heading: "Ground for resitement — site closure/acquisition by authority",
    text: "Closure/acquisition of the existing site by a competent authority for reasons not attributable to dealer.",
    tags: ["resitement", "acquisition", "authority"],
  },
  {
    id: "POL-RESITE-1.1d",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(d)",
    heading: "Ground for resitement — closure of nearby revenue-contributing business",
    text:
      "Closure of nearby business activities (e.g., stone quarries, road construction activities, private bus depots, etc.), beyond the control of the dealer, which were contributing to ROS revenue, rendering the RO unviable. For this purpose, viability will be minimum 100 KL per month combined potential of MS & HSD.",
    tags: ["resitement", "viability", "business closure"],
  },
  {
    id: "POL-RESITE-1.1e",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.1(e)",
    heading: "Ground for resitement — forced vacation",
    text:
      "Dealer is forced to vacate existing site by the lessor or any authority after the dealer has exhausted all legal remedies up to High Court.",
    tags: ["resitement", "eviction", "lease"],
  },
  {
    id: "POL-RESITE-1.2",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.2",
    heading: "Reconstitution alongside resitement",
    text:
      "If dealer proposes to reconstitute the dealership along with resitement, the same will be allowed subject to meeting reconstitution guidelines in vogue.",
    tags: ["resitement", "reconstitution"],
  },
  {
    id: "POL-RESITE-1.3",
    documentTitle: "Guidelines on Resitement for Retail Outlet Dealerships (HQO, Ref: RET/AKS/RESITEMENT, 09-Apr-2025)",
    clauseNumber: "1.3",
    heading: "Viability threshold and onus to provide land",
    text:
      "For all cases of resitement (i.e. 'A/CC' site or 'B/DC' site), onus to provide land will be on dealer. Resitement of an existing Company Owned (A/CC) retail outlet can be carried out only on company owned basis subject to estimated combined MS/HSD sales volume from the proposed location being minimum 150 KL/month for A/B class cities and National Highways, 100 KL/month for State Highways and C class cities, and 70 KL/month for other locations.",
    tags: ["resitement", "viability", "land"],
  },
  {
    id: "POL-CFS-1.1",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.1",
    heading: "Corpus Fund working-capital assistance for SC/ST dealerships",
    text:
      "Financial assistance will be given to persons belonging to Scheduled Castes and Scheduled Tribes on award of dealerships: the Oil Company provides working capital assistance/loan for a full operation cycle (equivalent to 7 days' sales volume), at SBI MCLR + 1% p.a. or 11% p.a. whichever is lower, recovered in 100 monthly instalments commencing from the 13th month of commissioning. Initial working capital assistance is capped at 18 KL each of MS and HSD, calculated separately.",
    tags: ["cfs", "corpus fund", "sc/st", "working capital", "budget"],
  },
  {
    id: "POL-CFS-1.2",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.2",
    heading: "Annual interest-rate revision on Corpus Fund loan",
    text: "Based on SBI MCLR as on 1st of April every year, interest rate for Corpus Fund loan will be revised for the outstanding loan amount.",
    tags: ["cfs", "corpus fund", "interest rate"],
  },
  {
    id: "POL-CFS-1.3",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.3",
    heading: "Augmentation of Corpus Fund loan on growth volume",
    text:
      "Augmentation of initial working capital assistance may be done through additional loan between two to four years after commissioning, subject to no default/delay on repayment and a minimum 50% increase in sales compared to projected 2nd-year volume, capped at 18 KL each of MS and HSD.",
    tags: ["cfs", "corpus fund", "budget", "growth"],
  },
  {
    id: "POL-CFS-1.4",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.4",
    heading: "Total Corpus Fund loan computation",
    text:
      "Additional Corpus fund loan on growth volume can be given for maximum 18 KL of MS and 18 KL of HSD. In other words, the total loan amount would be: (a) outstanding of the initial corpus fund loan; plus (b) amount equivalent to 7 days' sales of the growth volume, subject to a maximum of 18 KL of MS and HSD.",
    tags: ["cfs", "corpus fund", "budget"],
  },
  {
    id: "POL-CFS-1.5",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.5",
    heading: "Interest-rate revision mechanics",
    text:
      "The revision in rate of interest at the beginning of April of every year (as per the prevailing MCLR of SBI for tenure of one year + 1%) or 11% p.a., whichever is lower, would be applicable on the outstanding amount.",
    tags: ["cfs", "corpus fund", "interest rate"],
  },
  {
    id: "POL-CFS-1.6",
    documentTitle: "Financial Assistance Scheme for SC/ST RO Dealerships — Corpus Fund Scheme (HQO, Ref: RET/ZHA/MKT, 28-Apr-2018)",
    clauseNumber: "1.6",
    heading: "Applicability beyond SC/ST category",
    text: "This financial assistance scheme will also be applicable for other category dealerships selected under Corpus Fund Scheme (in addition to SC/ST Category).",
    tags: ["cfs", "corpus fund", "eligibility"],
  },
  {
    id: "POL-EAM-5.2a",
    documentTitle: "Expenditure Approval Memo (EAM), Chapter V — Capital Projects",
    clauseNumber: "5.2.a",
    heading: "AR approval authority — Regional Bids Committee",
    text:
      "AR (Annual Rent/capital) approval authority for AR value up to Rs. 75 Lacs lies with the Regional Bids Committee (RBC).",
    tags: ["eam", "budget", "approval", "rbc"],
  },
  {
    id: "POL-DSG-ASC",
    documentTitle: "Dealer Selection Guidelines 2023 — Annexure V",
    clauseNumber: "Annexure V",
    heading: "Application Scrutiny Committee (ASC) — eligibility checklist",
    text:
      "The ASC verifies each application against 19 objective criteria — notarized affidavit, proof of age, proof of land ownership/lease, land details matching land ownership documents, Group 1/2 verification via Company advocate, partnership documentation, category eligibility certificates, and (for non-individual applicants) registration/incorporation and profitability certificates — before recommending the candidate as Eligible, Ineligible, Eligible Subject to Rectification of Deficiencies, or for consideration under Group-3.",
    tags: ["asc", "dsg", "scrutiny", "eligibility", "dealer selection"],
  },
  {
    id: "POL-DSG-LEC",
    documentTitle: "Dealer Selection Guidelines 2023 — Annexure W1",
    clauseNumber: "Annexure W1",
    heading: "Land Evaluation Committee (LEC) — site suitability parameters",
    text:
      "The LEC physically inspects the offered land and certifies whether it meets the minimum advertised frontage, depth (measured perpendicular to the frontage after leaving the Right of Way line) and area; falls within the advertised area/stretch; is free of any High Tension line above 11 KV passing over it; and, where the plot abuts a National Highway, meets NHAI norms. The offered land is recommended suitable for RO development only if all applicable parameters are met.",
    tags: ["lec", "dsg", "land evaluation", "site inspection", "row"],
  },
  {
    id: "POL-DSG-FVC",
    documentTitle: "Dealer Selection Guidelines 2023 — Annexure Y",
    clauseNumber: "Annexure Y",
    heading: "Field Verification of Credentials (FVC) — document verification",
    text:
      "FVC officers verify, against original documents produced by the provisionally selected candidate, the category certificate, individual/non-individual status, date of birth/incorporation, marital status, educational qualification, the land documents already found suitable by the LEC, the PAN used at registration, proof of the authorized person (for non-individual entities) and any name-change gazette notification — endorsing each as verified with original and found correct/incorrect, with any discrepancy investigated further before appointment.",
    tags: ["fvc", "dsg", "verification", "credentials", "documents"],
  },
  {
    id: "POL-DSG-GROUP",
    documentTitle: "Dealer Selection Guidelines 2023 — Appendix IA / Annexure P",
    clauseNumber: "Clause 9 (Appendix IA)",
    heading: "Group 1 / Group 2 / Group 3 land-offer classification",
    text:
      "An applicant offering land owned by self or family qualifies under Group 1; an applicant offering a firm third-party offer of land qualifies under Group 2; an applicant with no land offer at the time of application is placed in Group 3 and is considered only if no eligible candidate is available from Group 1 or Group 2, in which case the Group-3 applicant must arrange land as advised by the Oil Company. The Company's advocate confirms in writing which Group the offered land falls under before the ASC records its recommendation.",
    tags: ["dsg", "group", "land", "eligibility", "asc"],
  },
  {
    id: "POL-DSG-APPFEE",
    documentTitle: "Dealer Selection Guidelines 2023 — Appendix IA",
    clauseNumber: "Application fee table",
    heading: "Non-refundable application fee by category",
    text:
      "Non-refundable application fee at the time of online application: Regular RO — SC/ST Rs. 3,000, OBC Rs. 5,000, Open Rs. 10,000; Rural RO — SC/ST Rs. 2,500, OBC Rs. 4,000, Open Rs. 8,000. The same fee applies to sub-categories (CC1/CC2/PH) under the respective main category.",
    tags: ["dsg", "application fee", "eligibility"],
  },
  {
    id: "POL-EAM-3",
    documentTitle: "Empowerment & Authority Manual (EAM) v2.0, Chapter II — Sales",
    clauseNumber: "3",
    heading: "Policy for dealer appointment, reconstitution, termination",
    text:
      "Policies for appointment, inclusion of partners, termination and change of constitution/nomenclature of Dealers, Resellers, COD, CFA, Lube Distributors, Agencies and Channel Partners — including authority to enter into and terminate such agreements, in India and abroad — are formulated by the SBU Head in consultation with Head Legal (Marketing).",
    tags: ["eam", "dealer", "policy", "reconstitution", "termination"],
  },
  {
    id: "POL-EAM-6.2b",
    documentTitle: "Empowerment & Authority Manual (EAM) v2.0, Chapter I — General",
    clauseNumber: "6.2.b",
    heading: "Retail engineering / professional-service engagement — approval chain",
    text:
      "For Retail SBU engagements (subject to availability of budget): up to Rs. 5 lakhs — Regional Bids Committee; up to Rs. 20 lakhs — Zonal Bids Committee, Retail Engineering; up to Rs. 50 lakhs — Bids Committee, HQO; up to Rs. 150 lakhs — Contracts Committee; up to Rs. 1000 lakhs — Executive Committee; over Rs. 1000 lakhs — CFD.",
    tags: ["eam", "budget", "canopy", "rbc", "approval", "retail engineering"],
  },
  {
    id: "POL-EAM-7.1",
    documentTitle: "Empowerment & Authority Manual (EAM) v2.0, Chapter II — Sales",
    clauseNumber: "7.1.a / 7.1.b",
    heading: "Dealer appointment — selection & Letter of Intent authority",
    text:
      "Selection of a dealer/distributor/reseller through the Selection Committee, governed by the SBU's 'Guidelines for Selection of Dealership', is approved by the Head of Zone — Retail/LPG; the resulting Letter of Intent / Appointment Letter is issued by the Head of Region — Retail/LPG.",
    tags: ["eam", "dealer selection", "appointment", "loi"],
  },
  {
    id: "POL-EAM-11.1",
    documentTitle: "Empowerment & Authority Manual (EAM) v2.0, Chapter II — Sales",
    clauseNumber: "11.1",
    heading: "Dealer resignation / termination authority",
    text:
      "Resignation is accepted only after accounts are reconciled, amounts due collected and all equipment/assets received in full. Acceptance of resignation (non-SC/ST) lies with the Head of Zone / Head GA; termination (non-SC/ST) also lies with the Head of Zone / Head GA. For SC/ST dealerships, acceptance of resignation lies with the Head of SBU and termination requires the Director — Marketing.",
    tags: ["eam", "resignation", "termination", "dealer"],
  },
  {
    id: "POL-EAM-11.2",
    documentTitle: "Empowerment & Authority Manual (EAM) v2.0, Chapter II — Sales",
    clauseNumber: "11.2.a",
    heading: "Resitement of Retail Outlets — approval authority",
    text:
      "Full resitement of a dealer-owned or company-owned Retail Outlet is approved by the Head of Zone — Retail, governed by the SBU's 'Policy Guidelines for Resitement' issued from time to time; resitement of a company-owned outlet requires prior approval for surrender of the existing outlet site.",
    tags: ["eam", "resitement", "approval"],
  },
];

// ---------------------------------------------------------------------------
// Module 2 — Dealer Selection & Development cases
// ---------------------------------------------------------------------------

// Deliberately empty. The reference case files (Kalka Sales/Nacholi, Gayatri
// resitement, Roopendra) were used to ground the AI engine's templates and
// the type model in real formats — not to pre-populate this list. A real
// Sales Officer opens a case here (new-site development or resitement, for
// any outlet/stretch) and the system generates each document fresh.
export const seedDealerCases: DealerCase[] = [];

// ---------------------------------------------------------------------------
// Module 7 — Dealer Request Desk
// ---------------------------------------------------------------------------

// Deliberately empty, same "live generator" principle as Module 2: a dealer
// raises a real ROMMS/ITPS/SMS/Market-Intelligence request through the UI for
// their own outlet, and the system classifies criticality and drafts the
// AI triage note fresh — nothing is pre-populated here.
export const seedDealerRequests: DealerRequest[] = [];
