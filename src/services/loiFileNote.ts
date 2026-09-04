import type { DealerCase, LoiFileNoteForm, LoiActivityRow } from "../types.js";
import { store } from "../store.js";

/**
 * Prefills whatever real data the case already carries (application, feasibility form, ASC/LEC/
 * FVC results); the selection narrative, advertisement details, land-parcel description and
 * annexure list are genuinely case-specific prose the SO writes — left blank rather than guessed.
 *
 * A Resitement case already has outletId set (the existing outlet being resited — see
 * createCase()), so its real Master Sheet data (District, Class of Market, Sales Area, Dealer
 * Name) is used ahead of the Application/Feasibility form, which a resitement case may never
 * fill in since the outlet already exists. A fresh new-site case has no outletId yet at this
 * stage, so it falls through to the application/feasibility data exactly as before.
 */
export function defaultLoiFileNoteForm(c: DealerCase): LoiFileNoteForm {
  const app = c.application;
  const asc = c.inspections.asc;
  const existingOutlet = c.outletId ? store.outlets.get(c.outletId) : undefined;
  const lec = c.inspections.lec;
  const fvc = c.inspections.fvc;

  const activities: LoiActivityRow[] = [
    { activity: "HPCL Advocate Opinion", date: "", team: "", result: "", attachment: "" },
    {
      activity: "LEC",
      date: lec?.completedAt.slice(0, 10) ?? "",
      team: lec ? `${lec.member1} and ${lec.member2}` : "",
      result: lec?.recommendationSuitable === "Yes" ? "Land found suitable" : lec?.recommendationSuitable === "No" ? "Land found not suitable" : "",
      attachment: "",
    },
    {
      activity: "FVC",
      date: fvc?.completedAt.slice(0, 10) ?? "",
      team: fvc ? `${fvc.member1} and ${fvc.member2}` : "",
      result: fvc ? "Documents verified" : "",
      attachment: "",
    },
    { activity: "Appendix XA", date: "", team: "", result: "", attachment: "" },
    { activity: "ID Proofs (PAN Card and Aadhar Card)", date: "", team: "", result: "", attachment: "" },
    { activity: `${app?.applicantCategory ?? "Category"} Certificate`, date: "", team: "", result: "", attachment: "" },
    { activity: "Educational Qualification", date: "", team: "", result: "", attachment: "" },
    { activity: "Layout Sketch", date: "", team: "", result: "", attachment: "" },
    { activity: "Land Documents", date: "", team: "", result: "", attachment: "" },
  ];

  return {
    regionalOfficeName: "",
    advertisedLocationDescription: c.stretchName,
    locationSerialNo: "",
    advertisementDate: "",
    newspapers: "",
    lastDateToApply: "",

    category: app?.applicantCategory ?? "",
    typeOfRO: app?.typeOfRO ?? "",
    classOfMarket: existingOutlet?.masterSheet["Class of Market"] ?? c.feasibilityReportForm?.classOfMarket ?? "",
    typeOfSite: "",
    plotSizeM: app ? `${app.frontageM} X ${app.depthM}` : "",
    district: existingOutlet?.district ?? app?.district ?? c.feasibilityReportForm?.district ?? "",
    modeOfSelection: "",
    noOfResponse: "",

    selectionNarrative: "",

    ascCommitteeSize: 2,
    ascDate: asc?.completedAt.slice(0, 10) ?? "",
    ascAnnexureRef: "",

    activities,

    selectedApplicantName: existingOutlet?.dealerName ?? app?.applicantName ?? "",
    advocateReportDate: "",
    landParcelDescription: "",
    jamabandiYear: "",
    village: app?.revenueVillage ?? "",
    tehsil: app?.tehsil ?? "",
    verifiedAreaSqM: app ? String(Math.round(app.areaSqM)) : "",
    fvcDate: fvc?.completedAt.slice(0, 10) ?? "",
    landDocumentsAnnexureRef: "",
    dealerPortalAnnexureRef: "",

    annexureList: [],
  };
}

/** Renders the exact real "File Note for LOI" format — verified against a real sample file note. */
export function renderLoiFileNoteText(form: LoiFileNoteForm): string {
  const activityRows = form.activities.map(
    (a, i) => `${i + 1} | ${a.activity} | ${a.date || "NA"} | ${a.team || "NA"} | ${a.result || ""} | ${a.attachment || ""}`,
  );

  const locationTable = [
    `1 | Location Serial No | ${form.locationSerialNo}`,
    `2 | Category | ${form.category}`,
    `3 | Type of RO | ${form.typeOfRO}`,
    `4 | Class of Market | ${form.classOfMarket}`,
    `5 | Type of Sites | ${form.typeOfSite}`,
    `6 | Plot Size (m) | ${form.plotSizeM}`,
    `7 | District | ${form.district}`,
    `8 | Mode of Selection | ${form.modeOfSelection}`,
    `9 | No. of Response | ${form.noOfResponse}`,
  ];

  return [
    `${form.regionalOfficeName} advertised for setting up Retail Outlet at location "${form.advertisedLocationDescription}" (Adv. Serial No. ${form.locationSerialNo}) on ${form.advertisementDate} in ${form.newspapers}. Last date to submit the application was ${form.lastDateToApply}. Details of Location are as following:`,
    ``,
    ...locationTable,
    ``,
    form.selectionNarrative,
    ``,
    `ASC was conducted by ${form.ascCommitteeSize} member's committee on ${form.ascDate}. ASC observed that selected candidate has been found eligible. (copy of ASC is enclosed as Annexure ${form.ascAnnexureRef}).`,
    ``,
    `Sr. No | Activity | Date | Team | Result/ Observations | Attachment`,
    ...activityRows,
    ``,
    `${form.selectedApplicantName} was found eligible. Further. With regard to the subject Location, additional points are detailed hereunder:`,
    `As per Advocate Report dated ${form.advocateReportDate}, applicant namely ${form.selectedApplicantName} has taken land at ${form.landParcelDescription} as per Jamabandi for the year ${form.jamabandiYear}, situated at Village – ${form.village}, Tehsil – ${form.tehsil} Dist. ${form.district} for setting up Retail Outlet.`,
    `Site measuring ${form.plotSizeM} was required in the advertisement which has been provided by the applicant. Scrutiny by ASC was carried out by ASC team dated ${form.ascDate}, who has verified the availability of ${form.verifiedAreaSqM} sq. mtrs. Further, the LEC team has verified the required dimensions during their site visit.`,
    `All the documents provided by the applicant were verified and found to be correct by the FVC Team vide its report dated ${form.fvcDate}.`,
    `Land documents of above location submitted by applicant has been enclosed as per (Annexure ${form.landDocumentsAnnexureRef})`,
    `We have submitted details of LOI approval in Dealer chayan portal for your approval and has been enclosed as per (Annexure ${form.dealerPortalAnnexureRef}).`,
    `It is further submitted that all documents including land records have been checked and verified and found to be correct in line with application and eligible for issuance of LOI.`,
    `The Region confirms that the candidate was found to be qualified as per Age, Qualification and Category of dealership as advertised.`,
    ``,
    `Approval Sought for :`,
    `Management approval is sought for issuing LOI to ${form.selectedApplicantName} for Location "${form.advertisedLocationDescription}"`,
    ``,
    `List of Annexures:`,
    ...form.annexureList.map((a, i) => `${i + 1}. ${a}`),
  ].join("\n");
}
