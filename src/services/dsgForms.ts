/**
 * Real field layouts from the Dealer Selection Guidelines 2023 (HPCL/IOC/BPC
 * common brochure), used to build and format the ASC (Annexure V), LEC
 * (Annexure W1) and FVC (Annexure Y) checklists exactly as the source
 * documents lay them out, so the final report reads like the real Annexure
 * rather than a generic bullet summary.
 */
import type { AscResult, LecResult, FvcResult } from "../types.js";

export const ASC_CHECKLIST_TEMPLATE: { id: string; particular: string; applicability: string }[] = [
  { id: "1", particular: "Copy of Notarized Affidavit as per Appendix-XA (individual) / Appendix-XB (non-individual) uploaded — all clauses per standard format present", applicability: "All" },
  { id: "2", particular: "All stamp papers for affidavits purchased in the name of the Deponent", applicability: "All" },
  { id: "3", particular: "Proof of Age uploaded — between 21 to 60 years (individual) / 3 years from date of registration for entities", applicability: "All except FF" },
  { id: "4", particular: "Proof of educational qualification submitted", applicability: "All Individual applicant" },
  { id: "5", particular: "Copy of Layout / Site Map of the offered plot of land uploaded", applicability: "All" },
  { id: "6", particular: "Copy of Khasra / Khatouni or equivalent revenue document confirming ownership status as on date of application", applicability: "All" },
  { id: "7", particular: "Copy of relevant land documents in support of ownership / lease rights uploaded", applicability: "All" },
  { id: "8", particular: "Affidavit as per Appendix-III (offer of land), if applicable, uploaded", applicability: "Wherever applicable" },
  { id: "9", particular: "Affidavit (Appendix-III) tendered by owner(s) of offered land is of a date on or before the date of application", applicability: "Wherever applicable" },
  { id: "10", particular: "Land details mentioned in application match land ownership documents submitted", applicability: "All" },
  { id: "11", particular: "Applicant falls under Group 1 (Owned land) after verifying land documents from Company advocate / Legal department", applicability: "For Group 1 applicants" },
  { id: "12", particular: "Applicant falls under Group 2 (Firm offer) after verifying land documents from Company advocate / Legal department", applicability: "For Group 2 applicants" },
  { id: "13", particular: "In case of application under partnership, all partners have declared their details separately", applicability: "Partnership" },
  { id: "14", particular: "In case of application under partnership, eligibility documents of each partner uploaded", applicability: "Partnership" },
  { id: "15", particular: "In case of application under partnership, draft partnership deed uploaded", applicability: "Partnership" },
  { id: "16", particular: "Eligibility certificate for the category uploaded as applicable (SC/ST, OBC, CC1, CC2, PH, FF, OSP, PACS, DGR certificate)", applicability: "As per Category" },
  { id: "17", particular: "Authorization / Resolution by entity for declaring authorized person uploaded", applicability: "All Non-Individual applicant" },
  { id: "18", particular: "Attested copy of Registration certificate / Certificate of Incorporation of the entity from competent authority", applicability: "All Non-Individual applicant" },
  { id: "19", particular: "Certificate of Chartered Accountant certifying profits during the previous 3 financial years", applicability: "Registered Society / Company (excluding PACS)" },
];

export const LEC_EVALUATION_TEMPLATE: { id: string; criterion: string }[] = [
  { id: "1a", criterion: "Offered land meets minimum frontage as specified in advertisement" },
  { id: "1b", criterion: "Offered land meets minimum depth (perpendicular to frontage at least at one place after leaving the ROW line)" },
  { id: "1c", criterion: "Offered land meets minimum area as specified in advertisement" },
  { id: "2", criterion: "Offered land is within advertised area / stretch" },
  { id: "3", criterion: "No High Tension line (> 11 KV) is passing over the offered land" },
  { id: "4", criterion: "Offered land meets NHAI norms (applicable only where offered land abuts a National Highway)" },
];

export const FVC_ITEMS_TEMPLATE: { itemNo: number; particularsToBeVerified: string; documentsToBeVerified: string }[] = [
  { itemNo: 1, particularsToBeVerified: "Category (except for open)", documentsToBeVerified: "Certificates issued by the competent authority" },
  { itemNo: 2, particularsToBeVerified: "Status of applicant (Individual / Non-individual)", documentsToBeVerified: "Certificate of registration / incorporation for non-individual entity; photograph & signature verified against original for individual" },
  { itemNo: 3, particularsToBeVerified: "Date of Birth / Date of incorporation", documentsToBeVerified: "10th Std. Board Certificate / School Leaving Certificate / Birth Certificate / Passport / Election ID / PAN / Aadhar / Registration Certificate" },
  { itemNo: 4, particularsToBeVerified: "Marital Status (individual applicants only)", documentsToBeVerified: "Notarized Affidavit as per Appendix-XA / Marriage Certificate (if available)" },
  { itemNo: 5, particularsToBeVerified: "Educational Qualification (individual applicants only)", documentsToBeVerified: "Certificate of qualification" },
  { itemNo: 6, particularsToBeVerified: "Verification of original land documents pertaining to the offered land found suitable by LEC", documentsToBeVerified: "Relevant land documents uploaded by the applicant, arranged in original at time of FVC" },
  { itemNo: 7, particularsToBeVerified: "Verification of PAN used by applicant while registering", documentsToBeVerified: "PAN of applicant (individual); PAN of entity and authorized person (non-individual)" },
  { itemNo: 8, particularsToBeVerified: "Proof of Authorized Person (for Non-Individual Entity)", documentsToBeVerified: "Authority letter & copy of Resolution specifying the authorized person" },
  { itemNo: 9, particularsToBeVerified: "Proof of Name Change", documentsToBeVerified: "Gazette Notification on name change" },
];

/** Mirrors the real Annexure V layout exactly — verified against a real filled HPCL ASC report. */
export function formatAscReport(r: AscResult): string {
  const lines = [
    "Annexure - V",
    "Format for Scrutiny of Applications for RO Dealership (to be used by ASC)",
    "",
    `Name of Regional Office: ${r.regionalOfficeName}    Location Sr. No.: ${r.locationSrNo}`,
    `Location: ${r.location}    District: ${r.district}    State: ${r.state}    Category: ${r.category}    Type of Ro: ${r.typeOfRO}`,
    `Application form number: ${r.applicationFormNo}`,
    `Name: ${r.applicantName}`,
    `Father's/Husband's Name: ${r.fatherOrSpouseName}`,
    `Name of spouse if applicable: ${r.spouseName ?? ""}`,
    "",
    "ELIGIBILITY",
    ...r.items.map((it) => `${it.id}. ${it.particular} [${it.applicability}] — ${it.answer || "(not answered)"}`),
    "",
    "Remarks: Following deficiencies have been observed during scrutiny:-",
    "Rectifiable",
    ...(r.rectifiableDeficiencies.length ? r.rectifiableDeficiencies.map((d, i) => `  ${String.fromCharCode(97 + i)}. ${d}`) : ["  NA"]),
    "Non Rectifiable",
    ...(r.nonRectifiableDeficiencies.length ? r.nonRectifiableDeficiencies.map((d, i) => `  ${String.fromCharCode(97 + i)}. ${d}`) : ["  NA"]),
    "",
    `CANDIDATE IS: ${r.recommendation || "(pending)"}`,
    "",
    `Signature with date Member - I: ${r.member1}`,
    `Signature with date Member - II: ${r.member2}`,
    `Signature of Officer at Division / Territory / Regional Office: ${r.reviewingOfficerName}${r.reviewingOfficerDesignation ? ` (${r.reviewingOfficerDesignation})` : ""}`,
    `Signature with Name & Designation of Officer In-Charge: ${r.officerInChargeName}${r.officerInChargeDesignation ? ` (${r.officerInChargeDesignation})` : ""}`,
    `Completed: ${r.completedAt.slice(0, 19).replace("T", " ")}`,
  ];
  return lines.join("\n");
}

export function formatLecReport(r: LecResult): string {
  const lines = [
    "Annexure - W1",
    "FORMAT FOR LAND EVALUATION BY LEC",
    "RETAIL OUTLET SITE EVALUATION PARAMETERS",
    "",
    `1. Advertised Location: ${r.advertisedLocation}    2. Regular / Rural: ${r.regularOrRural}`,
    `3. Category: ${r.category}`,
    `4. Offered Land: Plot No. ${r.landPlotNo}, Revenue Village ${r.revenueVillage}, Tehsil ${r.tehsil}, District ${r.district}, State ${r.state}`,
    `5. Offered Land Dimension: Frontage ${r.frontageM} m, Depth ${r.depthM} m, Area ${r.areaSqM} sq. m`,
    `6. Distance of land from prominent landmark: ${r.distanceFromLandmarkM} m from ${r.landmarkName}`,
    `7. Distance of edge of land from centre line of road: ${r.distanceEdgeFromCenterLineM} m`,
    `8. Width of Right of Way (ROW) of road: ${r.rowWidthM} m`,
    `9. Name / No. of road abutting offered plot: ${r.roadNameOrNo}`,
    `10. Lat/Long of a point within the offered plot: ${r.latLong}`,
    `11. Name of applicant: ${r.applicantName}`,
    "",
    "EVALUATION PARAMETER",
    ...r.evaluationItems.map((it) => `${it.id}. ${it.criterion} — ${it.answer || "(not answered)"}`),
    "",
    `Recommendation of LEC — Offered plot found suitable for development of a RO: ${r.recommendationSuitable || "(pending)"}`,
    ...(r.recommendationSuitable === "No" && r.reasonsIfNotSuitable.length
      ? ["If offered land is not found suitable, detailed reasons for non-suitability:", ...r.reasonsIfNotSuitable.map((x, i) => `  ${i + 1}. ${x}`)]
      : []),
    "",
    `Layout matches Layout Drawing (Appendix-V) uploaded by applicant: ${r.layoutMatchesApplication || "(not answered)"}`,
    r.layoutDeviationNotes ? `Deviation noted: ${r.layoutDeviationNotes}` : "No deviation noted.",
    "",
    `Member 1: ${r.member1}`,
    `Member 2: ${r.member2}`,
    r.member3 ? `Member 3 (in case offered plot is on NH): ${r.member3}` : "",
    `Completed: ${r.completedAt.slice(0, 19).replace("T", " ")}`,
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function formatFvcReport(r: FvcResult): string {
  const lines = [
    "Annexure - Y",
    "FORMAT FOR FIELD VERIFICATION OF CREDENTIALS FOR RO DEALERSHIP",
    "",
    `1) Name of advertised Location: ${r.advertisedLocation}    District: ${r.district}    State: ${r.state}    Category: ${r.category}`,
    `2) Full name of the Provisionally Selected Applicant: ${r.applicantFullName}`,
    `3) Application Form No.: ${r.applicationFormNo}`,
    `4) Residential Address of Provisionally selected candidate: ${r.residentialAddress}`,
    "",
    "7) The information/statements made in the application against each item has been verified as under:-",
    "Item | Particulars | Documents provided by applicant Y/N | Verified with original — Correct/Incorrect | Comments",
    ...r.items.map(
      (it) =>
        `${it.itemNo}. ${it.particularsToBeVerified} — Provided: ${it.documentsProvidedByApplicant || "(not answered)"} — ${it.verifiedCorrect || "(not answered)"}${it.comments ? ` — ${it.comments}` : ""}`,
    ),
    "",
    `Any other remarks: ${r.anyOtherRemarks || "(none)"}`,
    "",
    `Member 1: ${r.member1}`,
    `Member 2: ${r.member2}`,
    `Completed: ${r.completedAt.slice(0, 19).replace("T", " ")}`,
  ];
  return lines.join("\n");
}
