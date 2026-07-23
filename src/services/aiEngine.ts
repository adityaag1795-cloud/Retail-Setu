/**
 * Pluggable "Gen AI or otherwise" automation layer.
 *
 * The brief explicitly says: "automate entire things by using gen AI modules
 * or otherwise". This module gives both:
 *
 *   - TemplateAiEngine: deterministic, dependency-free text generation.
 *     This is what runs by default so the prototype is fully functional
 *     offline, with no API key and no network.
 *
 *   - AnthropicAiEngine: a thin wrapper around the real Claude API
 *     (POST https://api.anthropic.com/v1/messages via native fetch — no SDK
 *     dependency needed). It activates automatically the moment an
 *     ANTHROPIC_API_KEY env var is present, and falls back to the template
 *     engine if the call fails for any reason, so the app never breaks.
 *
 * Every "generate X" function in the codebase goes through `getAiEngine()`
 * so swapping the underlying model/provider is a one-line change.
 */

export type PromptKind =
  | "loi"
  | "budgetNote"
  | "modernisationBudgetNote"
  | "modernisationFileNote"
  | "leaseAgreement"
  | "dealershipAgreement"
  | "technicalEvaluationReport"
  | "policyAnswer"
  | "analyticsAnswer"
  | "dealerRequestTriage";

export interface AiEngine {
  readonly name: string;
  generate(kind: PromptKind, context: Record<string, unknown>): Promise<string>;
}

// ---------------------------------------------------------------------------
// Template engine — default, offline, deterministic
// ---------------------------------------------------------------------------

class TemplateAiEngine implements AiEngine {
  readonly name = "template-engine (offline, rule-based)";

  async generate(kind: PromptKind, ctx: Record<string, unknown>): Promise<string> {
    switch (kind) {
      case "loi":
        return this.loi(ctx);
      case "budgetNote":
        return this.budgetNote(ctx);
      case "modernisationBudgetNote":
        return this.modernisationBudgetNote(ctx);
      case "modernisationFileNote":
        return this.modernisationFileNote(ctx);
      case "leaseAgreement":
        return this.leaseAgreement(ctx);
      case "dealershipAgreement":
        return this.dealershipAgreement(ctx);
      case "technicalEvaluationReport":
        return this.technicalEvaluationReport(ctx);
      case "policyAnswer":
        return this.policyAnswer(ctx);
      case "analyticsAnswer":
        return this.analyticsAnswer(ctx);
      case "dealerRequestTriage":
        return this.dealerRequestTriage(ctx);
      default:
        return "No template available for this request.";
    }
  }


  /** Real HPCL Letter of Intent format — Dealer Selection Guidelines 2023, Annexure G1 (Corporation-developed Retail Outlet). */
  private loi(ctx: Record<string, unknown>): string {
    const { applicantName, stretchName, salesArea, district, state, category, subCategory } = ctx as {
      applicantName: string;
      stretchName: string;
      salesArea: string;
      district?: string;
      state?: string;
      category?: string;
      subCategory?: string;
    };
    const locationLine = `Location: ${stretchName}, District: ${district || "______"}, State: ${state || "______"}, Category: ${category || "______"}, Sub-Category: ${subCategory || "______"}`;
    return [
      `LETTER OF INTENT`,
      `(Dealer Selection Guidelines 2023, Annexure G1 — Retail Outlet developed by the Corporation)`,
      ``,
      `On Hindustan Petroleum Corporation Limited letter head`,
      ``,
      `Ref: ______                                                          Date: ______`,
      ``,
      `To,`,
      `Shri/Smt ${applicantName}`,
      ``,
      `Dear Sir/Madam,`,
      ``,
      `Sub: Proposed MS/HSD Regular/Rural Retail Outlet Dealership at ${locationLine}`,
      ``,
      `We refer to our advertisement and your application for the award of MS/HSD Retail Outlet dealership at the above location, and the subsequent Draw of Lot / intimation of your provisional selection.`,
      ``,
      `Please be informed that by this Letter of Intent, we propose to offer you a Retail Outlet dealership of Hindustan Petroleum Corporation Limited ("the Corporation") at the above location, ${salesArea}, on the following terms & conditions:-`,
      ``,
      `1. You have offered/agreed to arrange a suitable piece of land as indicated in your application for development of the subject Retail Outlet. You are required to make available the said land and submit all relevant land documents within the stipulated time (2 months for Group 1 / 4 months for Group 2) from the date of this letter, failing which this offer is liable to be withdrawn.`,
      `2. The Corporation shall prepare layouts/applications for obtaining all statutory approvals/licenses required for development of the Retail Outlet on the land offered by you. You shall coordinate with the concerned statutory authorities for issuance of all requisite NOCs/approvals/licences.`,
      `3. As and when advised by the Corporation, the site offered by you (including entry/exit/acceleration/de-acceleration/service road) shall be developed up to road level by cutting/filling with good earth, layer-wise compacted per standard engineering practice, and you shall construct the retaining/compound wall as approved by the Corporation. The land would thereafter be required to be transferred on lease for a minimum period as per the advertisement terms (renewable), or sold, to the Corporation.`,
      `4. The Corporation will develop the Retail Outlet at the above location on the said site (to be taken on lease/purchase) with appropriate structures, storage tanks and pumps. Additional facilities (Canopy, Service Station, etc.) may also be developed at the Corporation's sole discretion.`,
      `5. For the facilities provided by the Corporation, you would be required to pay a license fee as decided by the Corporation from time to time. The current rate of recovery is Rs. 435.83 per KL on MS and Rs. 363.19 per KL on HSD.`,
      `6. You will ensure all financial and other arrangements for operating the Retail Outlet dealership; in case of inability to arrange the funds required for infrastructure/working capital, this LOI can be withdrawn without any claim/damages against the Corporation.`,
      `7. You shall not induct any partner(s) nor change the constitution of partners as existing at the time of application without the Corporation's approval, except your spouse as per applicable terms.`,
      `8. It is a basic condition of this award that you shall personally manage the day-to-day affairs of the dealership and shall not assign or part with the same to any other person(s). You will not be eligible for any other employment; if presently employed, you must resign and produce proof of acceptance of resignation before issue of the Letter of Appointment.`,
      `9. You will deposit a Demand Draft towards Security Deposit (after adjusting the Initial Security Deposit already paid) at the time of issuance of the appointment letter, and a further Demand Draft towards the Non-refundable Bid Amount/Fixed Fee within 15 days of receipt of NOC. The Security Deposit carries no interest and is refundable on expiry of the dealership agreement, subject to forfeiture in case of proven adulteration/malpractice.`,
      `10. This Letter of Intent will stand automatically withdrawn and cancelled if: you or a family member holds/receives another RO/SKO-LDO dealership or LPG distributorship intimation; any material fact in your application is found suppressed or misrepresented; you are convicted of a criminal/economic offence involving moral turpitude; you fail to provide the land/develop facilities within the stipulated time; or in the event of death (if an individual/partner) — in which case the Initial Security Deposit stands forfeited.`,
      `11. This letter is issued to ${applicantName}. The dealership will be allotted to you on complying with the above terms and conditions, by issuance of the appointment letter along with signing of the Corporation's standard Dealership Agreement.`,
      ``,
      `Please acknowledge receipt of this letter.`,
      ``,
      `Thanking you,`,
      `Yours faithfully,`,
      `For Hindustan Petroleum Corporation Limited`,
      `(Duly Constituted Attorney)`,
      ``,
      `ACKNOWLEDGEMENT`,
      `I/We hereby accept this Letter of Intent with all the terms and conditions stipulated therein, and confirm eligibility for allotment under the Multiple Dealership Norm and that I am/we are not disqualified under the conditions mentioned therein.`,
      ``,
      `Place: ______                                                        Signature: ______`,
      `Date: ______                                                         Name: ${applicantName}`,
      ``,
      `[Generated by ${this.name} — real HPCL Annexure G1 LOI format; blanks marked ______ are to be filled by the SO/Regional Office from the actual bid/land file.]`,
    ].join("\n");
  }

  /** Styled after the real Regional Bids Committee (RBC) proposal, citing EAM Chapter V Clause 5.2.a. */
  private budgetNote(ctx: Record<string, unknown>): string {
    const { costEstimate, irr, context } = ctx as { costEstimate: number; irr: number; context: string };
    const withinRbcLimit = costEstimate <= 7_500_000; // EAM 5.2.a: RBC authority up to Rs. 75 Lacs
    return [
      `REGIONAL BIDS COMMITTEE (RBC) — BUDGET APPROVAL NOTE`,
      ``,
      `Context: ${context}`,
      `Cost Estimate: Rs. ${costEstimate.toLocaleString("en-IN")}`,
      `Project IRR (Post-Tax): ${irr.toFixed(2)}%`,
      ``,
      withinRbcLimit
        ? `As per EAM Chapter V Clause 5.2.a, AR approval authority for AR value up to Rs. 75 Lacs lies with the Regional Bids Committee (RBC). Investment is within RBC's delegated authority.`
        : `Investment exceeds the RBC's delegated authority (Rs. 75 Lacs per EAM Chapter V Clause 5.2.a) and requires Head Office EAM approval.`,
      `Recommendation: ${irr >= 12 ? "IRR meets the minimum threshold; recommended for approval." : "IRR is below the typical threshold; recommend seeking additional justification before approval."}`,
      ``,
      `[Generated by ${this.name}.]`,
    ].join("\n");
  }

  private modernisationBudgetNote(ctx: Record<string, unknown>): string {
    const { outletName, modernisationType, costEstimate, irr, dealerJustification, soJustification } = ctx as {
      outletName: string;
      modernisationType: string;
      costEstimate: { totalInvestment: number; civilAmount: number; plantMachineryAmount: number; gstAddback: number };
      irr: { irrPct: number | null; minimumHurdlePct: number; meetsHurdle: boolean; assumptions: { incrementalVolumeKLPerMonth: number; horizonYears: number } };
      dealerJustification: string;
      soJustification: string;
    };
    return [
      `${modernisationType.toUpperCase()} MODERNISATION — BUDGET APPROVAL NOTE (per EAM)`,
      ``,
      `Outlet: ${outletName}`,
      `Cost Estimate: Rs. ${costEstimate.totalInvestment.toLocaleString("en-IN")} (Civil Rs. ${costEstimate.civilAmount.toLocaleString("en-IN")} + Plant & Machinery Rs. ${costEstimate.plantMachineryAmount.toLocaleString("en-IN")} + GST addback Rs. ${costEstimate.gstAddback.toLocaleString("en-IN")})`,
      `Incremental committed volume: ${irr.assumptions.incrementalVolumeKLPerMonth} KL/month over ${irr.assumptions.horizonYears} years`,
      `IRR: ${irr.irrPct === null ? "not viable within horizon" : `${irr.irrPct.toFixed(1)}%`} (minimum hurdle per HQO circular: ${irr.minimumHurdlePct}%) — ${irr.meetsHurdle ? "MEETS hurdle" : "BELOW hurdle"}`,
      `Dealer justification: ${dealerJustification}`,
      `SO recommendation: ${soJustification}`,
      ``,
      `[Generated by ${this.name} — submit as per EAM delegation-of-power format once confirmed.]`,
    ].join("\n");
  }

  // Real HPCL "file noting" convention: Background -> Action Taken -> Proposal -> Approval
  // Sought For. Title/Subject is already carried separately on FileNote.subject.
  private modernisationFileNote(ctx: Record<string, unknown>): string {
    const { outletName, sapCode, dealerName, district, salesArea, classOfMarket, modernisationType, costEstimate, irr, dealerJustification, soJustification, policyClauses } = ctx as {
      outletName: string;
      sapCode: string;
      dealerName: string;
      district: string;
      salesArea: string;
      classOfMarket: string;
      modernisationType: string;
      costEstimate: { totalInvestment: number };
      irr: { irrPct: number | null; minimumHurdlePct: number; meetsHurdle: boolean };
      dealerJustification: string;
      soJustification: string;
      policyClauses: { clauseNumber: string; heading: string; documentTitle: string }[];
    };
    const irrLine =
      irr.irrPct === null
        ? "not viable within the chosen horizon"
        : `${irr.irrPct.toFixed(1)}% (${irr.meetsHurdle ? "meets" : "below"} the ${irr.minimumHurdlePct}% minimum per HQO circular)`;
    const clauseLine = policyClauses.length ? `Basis ${policyClauses.map((c) => `${c.documentTitle} clause ${c.clauseNumber}`).join("; ")}, it is ` : "It is ";

    // Master Sheet details, auto-populated from the real outlet record (not re-typed by the SO) —
    // only the fields actually present are shown, so a missing field is left out rather than
    // printed as a blank/guessed value.
    const masterSheetFields = [
      sapCode && `SAP Code ${sapCode}`,
      dealerName && `Dealer ${dealerName}`,
      district && `District ${district}`,
      salesArea && `Sales Area ${salesArea}`,
      classOfMarket && `Class of Market ${classOfMarket}`,
    ].filter(Boolean);
    const masterSheetLine = masterSheetFields.length ? `[${masterSheetFields.join(", ")}] ` : "";

    const background = `${masterSheetLine}Dealer at ${outletName} has requested ${modernisationType} modernisation. Dealer justification: ${dealerJustification}`;
    const actionTaken = `Cost estimate prepared and IRR computed by the SO. SO recommendation: ${soJustification}`;
    const proposal = `Cost estimate Rs. ${costEstimate.totalInvestment.toLocaleString("en-IN")}, IRR ${irrLine}. ${clauseLine}proposed that the ${modernisationType} modernisation at ${outletName} be approved and the budget note submitted as per EAM delegation of powers.`;
    const approvalSoughtFor = `Approval is sought for the ${modernisationType} modernisation investment of Rs. ${costEstimate.totalInvestment.toLocaleString("en-IN")} at ${outletName}.`;

    return [
      `Background: ${background}`,
      ``,
      `Action Taken: ${actionTaken}`,
      ``,
      `Proposal: ${proposal}`,
      ``,
      `Approval Sought For: ${approvalSoughtFor}`,
      ``,
      `[Generated by ${this.name}.]`,
    ].join("\n");
  }

  /** Real HPCL registered Lease Deed format (party recitals, demise clause, lessee/lessor covenants, provisos, schedule). */
  private leaseAgreement(ctx: Record<string, unknown>): string {
    const { outletName, lessorName, landDetails, leaseTermYears, monthlyRent } = ctx as {
      outletName: string;
      lessorName: string;
      landDetails: string;
      leaseTermYears: number;
      monthlyRent: number;
    };
    return [
      `LEASE DEED`,
      ``,
      `This Lease Deed is made at ______ this ______ day of ______, ______ BETWEEN ${lessorName} ` +
        `(hereinafter called "the Lessor", which expression shall include their heirs, successors, executors, ` +
        `administrators and assigns) of the One Part, AND HINDUSTAN PETROLEUM CORPORATION LIMITED, a company ` +
        `incorporated under the Indian Companies Act, 1956, having its Registered Office at 17, Jamshedji Tata ` +
        `Road, Mumbai – 400 020, and one of its Regional Offices at ______, represented by its duly Constituted ` +
        `Attorney (hereinafter called "the Lessee", which expression shall include its successors and assigns) ` +
        `of the Other Part.`,
      ``,
      `NOW THIS DEED WITNESSETH that in consideration of the rent hereby reserved and the covenants on the part ` +
        `of the Lessee hereinafter contained, the Lessor doth hereby demise unto the Lessee ALL AND SINGULAR the ` +
        `land described in the Schedule below (together with all ways, passages, lights, easements and ` +
        `appurtenances), TOGETHER WITH the right for the Lessee to install, erect and maintain thereon ` +
        `underground tanks, delivery pumps, shelters, buildings, extensions and other structures as the Lessee ` +
        `may consider necessary, for the purpose of storing, selling and otherwise carrying on trade in ` +
        `petroleum products and allied facilities, TO HOLD the same unto the Lessee for a term of ${leaseTermYears} ` +
        `years commencing from the date of possession, at a monthly rent of Rs. ${monthlyRent.toLocaleString("en-IN")} ` +
        `payable in advance on or before the tenth day of each month.`,
      ``,
      `Outlet: ${outletName}`,
      `Schedule of Land: ${landDetails}`,
      ``,
      `THE LESSEE COVENANTS WITH THE LESSOR:`,
      `(a) To pay the rent reserved at the time and in the manner aforesaid.`,
      `(b) To obtain and renew all necessary licences/permits for use of the premises for storing, selling and trading in petroleum products, and to observe all local, police and municipal rules in connection therewith.`,
      `(c) At the Lessee's own cost, to keep the buildings/structures/equipment in good and tenantable repair, with authority to demolish, reconstruct or replace the same without reference to the Lessor.`,
      `(d) To permit the Lessor to enter and view the condition of the premises at all reasonable times.`,
      `(e) To indemnify the Lessor against claims arising from any explosion or accident consequent upon the Lessee's use of the premises.`,
      `(f) To deliver up the demised premises to the Lessor at expiry/determination of the term, after restoring it to its former condition.`,
      `(g) To pay Service Tax/GST as extra, over and above the rent reserved, on the Lessor raising an invoice to that effect.`,
      ``,
      `THE LESSOR COVENANTS WITH THE LESSEE:`,
      `(a) That the Lessor has good right, full power and absolute authority to demise the premises as aforesaid.`,
      `(b) That the Lessee, punctually paying the rent and observing the covenants herein, shall peaceably hold, possess and enjoy the premises during the term without interruption from the Lessor or any person claiming under the Lessor.`,
      `(c) That on the Lessee's written request before expiry of the term (and absent any subsisting breach), the Lessor shall grant a further lease on mutually agreeable terms.`,
      `(d) That the Lessor will not sell or assign the reversionary interest without first giving the Lessee 90 days' notice and a pre-emptive option to purchase at the stated price.`,
      ``,
      `PROVIDED ALWAYS:`,
      `(A) The Lessee may sublet, license or part with possession of the premises for the permitted purposes without the Lessor's consent.`,
      `(B) The Lessee may erect, and later remove (making good any damage), fixtures, fittings, tanks, pumps, shelters and other structures/equipment.`,
      `(C) The Lessee may display name-boards, sign-boards and advertisements relating to its business.`,
      `(D) If rent remains in arrears for more than 90 days after demand, or the Lessee is in continuing breach 90 days after notice, the Lessor may determine this lease on 30 days' notice, without prejudice to either party's claims for prior breach.`,
      `(E) The Lessee may determine this agreement by giving the Lessor three months' notice in writing.`,
      `(F) Stamp duty and registration charges shall be borne by the Lessor; each party bears its own solicitors' charges.`,
      `(G) Any dispute arising under this Agreement shall be referred to the sole arbitration of the Director (Marketing) of the Lessee, or an officer nominated by him, under the Arbitration and Conciliation Act, 1996. The courts having jurisdiction over the Lessee's Regional Office shall alone have jurisdiction over any application or proceeding arising under this Agreement.`,
      ``,
      `IN WITNESS WHEREOF the Lessor and the duly Constituted Attorney of the Lessee have hereunto set their respective hands the day, month and year first above written.`,
      ``,
      `SIGNED by the Lessor: ______                    In the presence of: 1) ______   2) ______`,
      `SIGNED by the Constituted Attorney of Hindustan Petroleum Corporation Limited: ______   In the presence of: 1) ______   2) ______`,
      ``,
      `[Generated by ${this.name} — real HPCL registered Lease Deed format; a real deed requires legal vetting, stamping and registration before execution.]`,
    ].join("\n");
  }

  /** Real HPCL "Petrol/Diesel Dealer Agreement (For Corporation Owned Outlet)" format — 21 substantive clauses + 3 schedules, condensed from the real 67-clause source. */
  private dealershipAgreement(ctx: Record<string, unknown>): string {
    const { outletName, dealerName, tenureYears, salesArea } = ctx as {
      outletName: string;
      dealerName: string;
      tenureYears: number;
      salesArea: string;
    };
    return [
      `PETROL/DIESEL DEALER AGREEMENT`,
      `(FOR CORPORATION-OWNED OUTLET)`,
      ``,
      `MEMORANDUM OF AGREEMENT made this ______ day of ______, ______ BETWEEN HINDUSTAN PETROLEUM CORPORATION ` +
        `LIMITED, a company registered under the Indian Companies Act 1956, having its Registered Office at 17, ` +
        `Jamshedji Tata Road, Mumbai-400020, and Regional Office at ${salesArea} (hereinafter called "the ` +
        `Corporation") of the One Part, AND ${dealerName}, carrying on business at ${outletName} (hereinafter ` +
        `called "the Dealer") of the Other Part.`,
      ``,
      `WHEREAS the Corporation carries on the business of refining and sale of petroleum products, and is the ` +
        `owner/lessee of the land and structures at ${outletName} (hereinafter "the Premises") and has installed ` +
        `or is about to install thereon the apparatus and equipment described in the Second Schedule (hereinafter ` +
        `"the Outfit"); AND WHEREAS at the Dealer's request the Corporation has agreed to appoint the Dealer as ` +
        `its dealer for retail sale of certain petroleum products at the Premises on the terms hereinafter contained:`,
      ``,
      `NOW IT IS AGREED AS FOLLOWS:`,
      `1. Appointment. The Corporation hereby appoints the Dealer as its dealer for retail sale at the Premises of Petrol/Diesel/Motor Oils/Greases and such other products as may be specified from time to time ("the Products").`,
      `2. Licence, not tenancy. The Corporation grants the Dealer leave, licence and permission for the duration of this Agreement to enter upon and use the Premises and Outfit solely for storing, selling and handling the Products. The Dealer shall have no right, title or interest in the Premises or Outfit and shall not be deemed to be in exclusive possession; nothing herein shall confer on the Dealer the rights of a lessee, sub-lessee or tenant.`,
      `3. Term. This Agreement shall remain in force for ${tenureYears} years from the date of commissioning, determinable earlier by either party giving three months' notice in writing, without prejudice to the Corporation's right to terminate earlier under Clause 15. On expiry, the Corporation may, at its option, enter into a fresh agreement with the Dealer for a further term on the same conditions.`,
      `4. Licence fee. The Dealer shall pay the Corporation a monthly licence fee for use of the Outfit, as determined by the Central Government's directives from time to time. The current rate of recovery is Rs. 435.83 per KL on MS and Rs. 363.19 per KL on HSD.`,
      `5. Equipment. The Dealer shall install and maintain, at his own expense, the equipment described in the Third Schedule, purchased only from manufacturers approved by the Corporation.`,
      `6. Minimum offtake. The Dealer undertakes to uplift and pay for the minimum annual quantity of Products specified by the Corporation; the Corporation may revise this target from time to time, and may terminate this Agreement on three months' notice if the minimum is not achieved for two consecutive years.`,
      `7. Supply & payment. The Corporation will supply Products against payment in cash or demand draft, or on such credit/cheque facility as it may allow at its discretion; any bill remaining unpaid for four days entitles the Corporation to refuse further supply and treat this Agreement as repudiated by the Dealer. All taxes, surcharges and levies on the Products shall be borne by the Dealer.`,
      `8. Lien. The Corporation shall have a first charge or lien on all goods of the Dealer for the unpaid price of any Products sold and delivered under this Agreement.`,
      `9. Care of Outfit. The Dealer shall take reasonable care of the Outfit, Premises and containers, and shall be responsible for loss or damage thereto (normal wear and tear excepted); no repair shall be carried out by the Dealer without the Corporation's prior written authorisation, and the Dealer shall not operate the Outfit when out of order.`,
      `10. No alteration/signage without consent. The Dealer shall not alter the Premises, layout or Outfit, nor display signboards/advertisements, without the Corporation's prior written approval; breach entitles the Corporation to terminate forthwith and recover the cost of reinstatement.`,
      `11. Measurement, quality & exclusivity. Quantities delivered as measured by the Corporation's devices shall be final and binding. The Dealer shall not adulterate or contaminate the Products, shall not sell at prices higher than those fixed by the Corporation/statutory authority, and shall not deal in or store any other oil company's petroleum products at the Premises without the Corporation's written consent.`,
      `12. Personal management. It is a paramount condition that the Dealer (or, where a firm/society, the majority of partners/members) shall personally take active part in and supervise the management of the Retail Outlet, and shall not do so through any other person.`,
      `13. No transfer without consent. The Dealer shall not sell, assign, mortgage or otherwise transfer his interest in the dealership, nor change the constitution of a partnership/society dealer, without the Corporation's prior written consent.`,
      `14. Indemnity. The Dealer shall indemnify the Corporation against all losses, claims, suits or actions arising from injury to person or property, statutory violation, or the Dealer's non-observance of this Agreement, including any accident, loss or damage arising from storage, handling or sale of the Products at the Premises.`,
      `15. Termination. Notwithstanding anything herein, the Corporation may terminate this Agreement forthwith on: an uncured breach of any covenant (4 days' notice to remedy); the Dealer's death/insolvency, or (if a firm) dissolution/insolvency of a partner; attachment of the Dealer's effects continuing 7 days; conviction of the Dealer for a criminal offence; cancellation/revocation of the storage licence; default in payment beyond 4 days of demand; contamination, adulteration or overcharging of Products; any act prejudicial to the Corporation's interest or good name (in the Regional Manager's opinion, which shall be final); or any material information in the Dealer's application being found untrue. Termination under this clause shall be without prejudice to the Corporation's other rights and remedies, and without liability to pay any compensation to the Dealer.`,
      `16. Security deposit. The Dealer shall lodge such security deposit as the Corporation may stipulate from time to time, in cash or approved securities, for due fulfilment of his obligations. The deposit carries no claim to be applied against dues except at the Corporation's discretion, and is returnable only on termination of this Agreement and settlement of all accounts; the Corporation's deposit receipt alone is proof of the deposit and its value.`,
      `17. Vacant possession on termination. On termination, the Dealer shall pay any amount due within seven days, and shall remove his own goods and hand over vacant, peaceful possession of the Premises within seven days, failing which the Corporation may remove them at the Dealer's risk without liability for loss or damage.`,
      `18. Confidentiality & goodwill. The Dealer shall not divulge confidential information relating to the Corporation's business, and shall have no claim to compensation for goodwill on termination of this Agreement.`,
      `19. Force majeure. Neither party shall be liable for failure or delay in performance caused by circumstances beyond its reasonable control (war, riot, strike, lockout, act of God, breakdown of plant/refinery, shortage of crude or materials, and the like).`,
      `20. Arbitration & jurisdiction. Any dispute arising out of or in connection with this Agreement or its termination shall be referred to a sole arbitrator under the Arbitration & Conciliation Act, 1996, chosen from a panel of three names suggested by the Corporation (or, failing agreement, appointed by the competent court); the venue shall be the Corporation's Regional/other office, and the courts of that city alone shall have jurisdiction.`,
      `21. This Agreement supersedes all previous agreements between the parties in respect of the said dealership.`,
      ``,
      `THE FIRST SCHEDULE (Land — boundaries): East: ______  West: ______  North: ______  South: ______`,
      `THE SECOND SCHEDULE (Outfit): Tank(s), Dispensing Unit(s) and Nozzle(s) for MS and HSD as per the Fixed Asset Ledger of ${outletName}.`,
      `THE THIRD SCHEDULE (Dealer-provided facilities): Free air facility with calibrated air gauge; purified drinking water; first-aid box; clean toilet facility with running water.`,
      ``,
      `SIGNED for and on behalf of HINDUSTAN PETROLEUM CORPORATION LIMITED (by its Constituted Attorney): ______`,
      `SIGNED by the Dealer, ${dealerName}: ______`,
      `In the presence of: 1) ______   2) ______`,
      ``,
      `[Generated by ${this.name} — real HPCL Petrol/Diesel Dealer Agreement (Corporation-Owned Outlet) format; a real agreement requires legal vetting, stamping and signature before execution.]`,
    ].join("\n");
  }

  /** Styled after the real 3-member Technical Evaluation Committee report format for resitement cases. */
  private technicalEvaluationReport(ctx: Record<string, unknown>): string {
    const { existingOutletName, groundsSelected, committee, salesTrend, stretchName } = ctx as {
      existingOutletName: string;
      groundsSelected: string[];
      committee: { name: string; designation: string }[];
      salesTrend: string;
      stretchName: string;
    };
    const committeeLines = committee.map((m, i) => `  ${i + 1}. ${m.designation} (${m.name})`).join("\n");
    return [
      `Technical Evaluation report of Committee on the Proposed Resitement Plan of ${existingOutletName} to ${stretchName}.`,
      ``,
      `Grounds for resitement: ${groundsSelected.join("; ")}`,
      ``,
      `Committee members who visited the existing and proposed sites:`,
      committeeLines || "  (committee not yet appointed)",
      ``,
      `Sales trend at existing site: ${salesTrend}`,
      ``,
      `Recommendation: Basis the volume decline and the grounds cited, the committee recommends the proposed resitement subject to LEC clearance of the new site and standard downstream approvals.`,
      ``,
      `[Generated by ${this.name}.]`,
    ].join("\n");
  }

  /** Quotes every matched clause's real text (not just the top one) so a question spanning more than one provision gets all of them, not just the single best-scoring match. */
  private policyAnswer(ctx: Record<string, unknown>): string {
    const { question, matchedClauses } = ctx as {
      question: string;
      matchedClauses: { documentTitle: string; clauseNumber: string; heading: string; text: string }[];
    };
    if (matchedClauses.length === 0) {
      return `No matching clause found in the loaded policy set for: "${question}". Load more policy documents into the Knowledge Centre to widen coverage.`;
    }
    const blocks = matchedClauses.map(
      (c) => `Basis ${c.documentTitle}, clause ${c.clauseNumber} (${c.heading}):\n"${c.text}"`,
    );
    return blocks.join("\n\n");
  }

  private analyticsAnswer(ctx: Record<string, unknown>): string {
    const { question, resultSummary } = ctx as { question: string; resultSummary: string };
    return `Re: "${question}" — ${resultSummary}`;
  }

  /** First-line triage note for a dealer request — category-specific playbook, not a generic acknowledgement. */
  /** A simple, actionable first-line reply — no policy-clause citation, just the practical next step. */
  private dealerRequestTriage(ctx: Record<string, unknown>): string {
    const { category, subject, description, criticality, criticalityReason, outletName } = ctx as {
      category: string;
      subject: string;
      description: string;
      criticality: string;
      criticalityReason: string;
      outletName: string;
    };
    const playbooks: Record<string, string> = {
      ROMMS: "Check the complaint status directly in the ROMMS portal against the vendor's committed TAT. If the TAT has lapsed, escalate to the Regional ROMMS coordinator quoting the complaint reference and days elapsed.",
      ITPS: "Verify ATG probe power and cabling at the outlet, confirm the ITPS controller is online and syncing to SAP. If not restored within a few hours, log a call with the ITPS AMC vendor.",
      SMS: "Confirm the dealer's registered mobile number in SAP/CRM is current and not DND-blocked, resend the last price-change/DU alert manually. If the bulk SMS gateway itself is down, log it with the IT helpdesk.",
      MarketIntelligence: "This is informational, not a fault: log the competitor pricing/activity in the Regional MIS register and route it to the RO for a competitive response.",
      Load: "Please ensure Indent is placed and TPT TT is marked yes.",
      Other: "Acknowledge to the dealer, gather any missing specifics, and route to the appropriate department based on the description.",
    };
    const playbook = playbooks[category] ?? playbooks["Other"];
    return (
      `Dealer request "${subject}" (${category}) from ${outletName}: ${description}\n\n` +
      `Criticality: ${criticality} — ${criticalityReason}\n\n` +
      `Suggested first action: ${playbook}\n\n` +
      `[Generated by ${this.name}.]`
    );
  }
}

// ---------------------------------------------------------------------------
// Anthropic engine — real Gen AI, activates automatically with an API key
// ---------------------------------------------------------------------------

class AnthropicAiEngine implements AiEngine {
  readonly name = "anthropic-api (claude-sonnet-5)";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fallback = new TemplateAiEngine();

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generate(kind: PromptKind, context: Record<string, unknown>): Promise<string> {
    try {
      const prompt = this.buildPrompt(kind, context);
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((b) => b.type === "text")?.text;
      if (!text) throw new Error("No text content in Anthropic response");
      return text;
    } catch (err) {
      // Never let a live-AI outage break the workflow — degrade gracefully.
      const fallbackText = await this.fallback.generate(kind, context);
      return `${fallbackText}\n\n[Note: live Gen AI call failed (${(err as Error).message}); showing template fallback.]`;
    }
  }

  private buildPrompt(kind: PromptKind, ctx: Record<string, unknown>): string {
    if (kind === "policyAnswer") return this.buildPolicyAnswerPrompt(ctx);
    const base = `You are drafting an internal document for an oil-company retail network operations team. Be concise and professional.`;
    return `${base}\n\nDocument type: ${kind}\nContext (JSON): ${JSON.stringify(ctx, null, 2)}\n\nDraft the document now.`;
  }

  /**
   * A dedicated RAG-style prompt for the Knowledge Centre, rather than the generic "draft this
   * document" template above. The offline TemplateAiEngine already handles keyword/stem/intent
   * matching mechanically (see policyBot.ts); this prompt hands the SAME real clause text to Claude
   * and asks it to do what a keyword matcher can't — read the question for what it's actually
   * asking (its "essence"), reason over every candidate clause's actual meaning, and only then
   * decide which one(s) genuinely answer it. `candidatePool` is deliberately wider and
   * multi-document (unlike the single-document `matchedClauses` used for the offline template and
   * for the on-screen citation list) so a real semantic mismatch in the mechanical scoring doesn't
   * hide the right clause from Claude too.
   */
  private buildPolicyAnswerPrompt(ctx: Record<string, unknown>): string {
    const { question, candidatePool } = ctx as {
      question: string;
      candidatePool: { documentTitle: string; clauseNumber: string; heading: string; text: string }[];
    };
    const clauseBlock = candidatePool
      .map(
        (c, i) =>
          `[${i + 1}] Document: ${c.documentTitle}\nClause: ${c.clauseNumber} — ${c.heading}\nText: "${c.text}"`,
      )
      .join("\n\n");
    return [
      `You are the Knowledge Centre assistant for an oil-company retail network operations team. You answer`,
      `strictly from the real policy clauses given below — never from general knowledge or invented facts.`,
      ``,
      `Question: "${question}"`,
      ``,
      `Candidate clauses (retrieved by keyword/phrase matching, which is mechanical and can miss the real`,
      `intent of the question — read every one on its own merits, not just for shared words with the question):`,
      ``,
      clauseBlock || "(no candidate clauses were retrieved at all)",
      ``,
      `Instructions:`,
      `1. Judge each candidate by what it actually means, not by how many words it shares with the question.`,
      `   A clause can be the right answer even with little word overlap; a clause can share words with the`,
      `   question and still be irrelevant. Identify the question's real intent (e.g. "who" wants an approval`,
      `   authority or designation, "how much"/"what fee" wants a number or amount, "when"/"how long" wants a`,
      `   duration or deadline) and find the clause(s) that actually deliver that.`,
      `2. If one or more candidates genuinely answer the question, name the single most relevant governing`,
      `   document and quote its clause(s) verbatim (do not paraphrase or invent wording) with clause number`,
      `   and heading, then give a short, direct answer to the question grounded only in that quoted text.`,
      `   Cite from only that one document even if other documents' clauses also matched loosely.`,
      `3. If none of the candidates actually answer the question, say so plainly — do not stretch an`,
      `   unrelated clause into an answer, and do not fabricate a clause or number that isn't in the text above.`,
      `4. Be concise: a few sentences plus the quoted clause text is enough. No preamble, no meta-commentary`,
      `   about how you searched.`,
    ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedEngine: AiEngine | undefined;

export function getAiEngine(): AiEngine {
  if (cachedEngine) return cachedEngine;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const baseUrl = process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com";
  cachedEngine = apiKey ? new AnthropicAiEngine(apiKey, baseUrl) : new TemplateAiEngine();
  return cachedEngine;
}
