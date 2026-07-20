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
  | "fileNote"
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
      case "fileNote":
        return this.fileNote(ctx);
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


  /**
   * Produces the "Initiation" stage remarks of a real HPCL-style Approved
   * File Note — a short narrative (site/application/ASC-LEC-FVC summary +
   * recommendation), not a full standalone document. The routing chain
   * (Recommendation / Approval stages) is appended separately as each
   * approver actually acts, per dealerWorkflow.ts.
   */
  // Real HPCL "file noting" convention: Background -> Action Taken -> Proposal -> Approval
  // Sought For. Title/Subject is already carried separately on FileNote.subject (shown above
  // this text wherever the note is rendered), so it isn't repeated inside the body.
  private fileNote(ctx: Record<string, unknown>): string {
    const { application, inspections, policyClauses, stretchName, salesArea, caseType, competitorContext, roster, feasible } = ctx as {
      application: Record<string, unknown> | undefined;
      inspections: {
        asc?: { recommendation?: string };
        lec?: { recommendationSuitable?: string };
        fvc?: { anyOtherRemarks?: string };
      };
      policyClauses: { clauseNumber: string; heading: string; documentTitle: string }[];
      stretchName: string;
      salesArea: string;
      caseType: string;
      competitorContext: string;
      roster: { candidateName: string; feasible: boolean }[];
      feasible: boolean;
    };
    const applicantName = (application?.["applicantName"] as string | undefined) ?? "the applicant";
    const isResitement = caseType === "Resitement";

    const background =
      `${stretchName} (${salesArea}) was taken up for ${isResitement ? "resitement of the existing outlet" : "development of a new retail outlet"} ` +
      `following stretch/site identification. ${competitorContext} ${roster.length ? `${roster.length} candidate site(s) were evaluated on roster, of which ${roster.filter((r) => r.feasible).length} were assessed feasible.` : ""} ` +
      `The trading-area assessment found the location ${feasible ? "feasible" : "not currently feasible"}, and ${applicantName} submitted the Application Form for dealership.`;

    const summaryParts: string[] = [];
    if (inspections.asc) summaryParts.push(`Area Selection Committee (ASC) inspection carried out — ${inspections.asc.recommendation || "recorded"}`);
    if (inspections.lec) summaryParts.push(`Land Evaluation Committee (LEC) inspection carried out — ${inspections.lec.recommendationSuitable === "Yes" ? "site found suitable" : inspections.lec.recommendationSuitable === "No" ? "site found not suitable" : "recorded"}`);
    if (inspections.fvc) summaryParts.push("Field Verification of Credentials (FVC) completed — applicant credentials verified");
    const actionTaken = summaryParts.length ? `${summaryParts.join(". ")}.` : "ASC/LEC/FVC site inspections are yet to be completed.";

    const clauseLine = policyClauses.length ? `Basis ${policyClauses.map((c) => `${c.documentTitle} clause ${c.clauseNumber}`).join("; ")}, it is ` : "It is ";
    const proposal =
      `${clauseLine}proposed that the case be approved in favour of ${applicantName} for the retail outlet dealership at ${stretchName}, ` +
      `and that the Letter of Intent be issued, subject to submission of the site map, drawing & letter to the District Magistrate, ` +
      `PESO clearance, and receipt of NOC from all statutory departments within the prescribed timelines.`;

    const approvalSoughtFor = `Approval is sought for issue of the Letter of Intent in favour of ${applicantName} and for the case to proceed to milestone tracking.`;

    return [
      `Background: ${background.replace(/\s+/g, " ").trim()}`,
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

  /** Styled after the real Intimation Letter issued on provisional selection. */
  private loi(ctx: Record<string, unknown>): string {
    const { applicantName, stretchName, salesArea } = ctx as {
      applicantName: string;
      stretchName: string;
      salesArea: string;
    };
    return [
      `INTIMATION LETTER`,
      ``,
      `To: ${applicantName}`,
      `Re: Provisional selection for Retail Outlet Dealership — ${stretchName}, ${salesArea}`,
      ``,
      `This is to inform you that your application has been provisionally selected for award of the retail ` +
        `outlet dealership at the above location. You are requested to remit the prescribed initial security ` +
        `deposit and submit the following within the stipulated time: notarized affidavit (Appendix III), ` +
        `proof of age, proof of educational qualification, Khasra/Khatouni and land documents, site sketch, ` +
        `and PAN copy. Field Verification of Credentials (FVC) will follow. This intimation does not by ` +
        `itself confer any right to the dealership, which remains subject to compliance with the Dealer ` +
        `Selection Guidelines and issue of the Letter of Intent.`,
      ``,
      `[Generated by ${this.name}.]`,
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
    const { outletName, modernisationType, costEstimate, irr, dealerJustification, soJustification, policyClauses } = ctx as {
      outletName: string;
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

    const background = `Dealer at ${outletName} has requested ${modernisationType} modernisation. Dealer justification: ${dealerJustification}`;
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

  /** Styled after a real registered lease deed for an HPCL retail outlet site. */
  private leaseAgreement(ctx: Record<string, unknown>): string {
    const { outletName, lessorName, landDetails, leaseTermYears, monthlyRent } = ctx as {
      outletName: string;
      lessorName: string;
      landDetails: string;
      leaseTermYears: number;
      monthlyRent: number;
    };
    return [
      `LEASE DEED (Draft — for registration)`,
      ``,
      `This deed of lease witnesses that the Lessor, ${lessorName}, being the recorded owner of the land ` +
        `described below, does hereby demise unto Hindustan Petroleum Corporation Limited ("the Corporation") ` +
        `the said land for use as a retail outlet for petroleum products, TO HOLD the same unto the Corporation ` +
        `for a term of ${leaseTermYears} years, at a monthly rent of Rs. ${monthlyRent.toLocaleString("en-IN")}, ` +
        `subject to the covenants herein.`,
      ``,
      `Outlet: ${outletName}`,
      `Schedule of Land: ${landDetails}`,
      `Use: Retail outlet for sale of petroleum products and allied facilities.`,
      `Registration: To be registered with the Sub-Registrar having jurisdiction over the scheduled land, per applicable stamp duty.`,
      ``,
      `[Generated by ${this.name} — a real deed requires legal vetting and registration before execution.]`,
    ].join("\n");
  }

  /** Styled after HPCL's real Dealership Agreement (party block, appointment, tenure, schedules). */
  private dealershipAgreement(ctx: Record<string, unknown>): string {
    const { outletName, dealerName, tenureYears, salesArea } = ctx as {
      outletName: string;
      dealerName: string;
      tenureYears: number;
      salesArea: string;
    };
    return [
      `DEALERSHIP AGREEMENT (Draft)`,
      ``,
      `This Agreement is made between Hindustan Petroleum Corporation Limited ("the Corporation") and ${dealerName} ` +
        `("the Dealer") for the retail outlet at ${outletName}, ${salesArea}, for marketing of the Corporation's petroleum products.`,
      ``,
      `1. Appointment: The Dealer is appointed as a non-exclusive agent for retail sale of the Corporation's products at the outlet for a term of ${tenureYears} years from the date of commissioning.`,
      `2. Security Deposit: As prescribed by the Corporation from time to time.`,
      `3. Pricing & Supply: The Dealer shall sell only at prices notified by the Corporation and shall not adulterate or short-deliver.`,
      `4. Trademarks & Signage: The Dealer shall use the Corporation's trademarks and approved signage/format only for the duration of this Agreement.`,
      `5. Termination: The Corporation may terminate for breach, malpractice, or as otherwise provided in the Dealer Selection Guidelines.`,
      `6. Schedules: Schedule I — Land; Schedule II — Corporation's movable property/equipment; Schedule III — Dealer's own property.`,
      `7. Indemnity, Notices, Arbitration & Jurisdiction: As per the Corporation's standard Dealership Agreement terms.`,
      ``,
      `[Generated by ${this.name} — a real agreement requires legal vetting before execution.]`,
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

  private policyAnswer(ctx: Record<string, unknown>): string {
    const { question, matchedClauses } = ctx as {
      question: string;
      matchedClauses: { documentTitle: string; clauseNumber: string; heading: string; text: string }[];
    };
    if (matchedClauses.length === 0) {
      return `No matching clause found in the loaded policy set for: "${question}". Load more policy documents into the Knowledge Centre to widen coverage.`;
    }
    const best = matchedClauses[0]!;
    return [
      `Basis ${best.documentTitle}, clause ${best.clauseNumber} (${best.heading}):`,
      `"${best.text}"`,
      matchedClauses.length > 1 ? `\n${matchedClauses.length - 1} other related clause(s) also matched — see references below.` : "",
    ]
      .join("\n")
      .trim();
  }

  private analyticsAnswer(ctx: Record<string, unknown>): string {
    const { question, resultSummary } = ctx as { question: string; resultSummary: string };
    return `Re: "${question}" — ${resultSummary}`;
  }

  /** First-line triage note for a dealer request — category-specific playbook, not a generic acknowledgement. */
  private dealerRequestTriage(ctx: Record<string, unknown>): string {
    const { category, subject, description, criticality, criticalityReason, outletName, matchedClauses } = ctx as {
      category: string;
      subject: string;
      description: string;
      criticality: string;
      criticalityReason: string;
      outletName: string;
      matchedClauses?: { documentTitle: string; clauseNumber: string; heading: string }[];
    };
    const playbooks: Record<string, string> = {
      ROMMS: "Check the complaint status directly in the ROMMS portal against the vendor's committed TAT. If the TAT has lapsed, escalate to the Regional ROMMS coordinator quoting the complaint reference and days elapsed; do not let it sit unactioned past the SLA.",
      ITPS: "Verify ATG probe power and cabling at the outlet, confirm the ITPS controller is online and syncing to SAP, and cross-check against the outlet's tank-stock feed for a mismatch. If not restored within a few hours, log a call with the ITPS AMC vendor and note the downtime — sustained ITPS outage is an audit/vigilance exposure, not just an inconvenience.",
      SMS: "Confirm the dealer's registered mobile number in SAP/CRM is current and not DND-blocked, resend the last price-change/DU alert manually, and if the bulk SMS gateway itself is down, log it with the IT helpdesk — a dealer who misses a price-change SMS is a genuine Marketing Discipline Guidelines exposure.",
      MarketIntelligence: "This is informational, not a fault: log the competitor pricing/activity in the Regional MIS register and route it to the RO for a competitive response. No outage to restore.",
      Other: "Acknowledge to the dealer, gather any missing specifics, and route to the appropriate department based on the description.",
    };
    const playbook = playbooks[category] ?? playbooks["Other"];
    const clausesBlock = matchedClauses?.length
      ? `\n\nRelevant Knowledge Centre clauses:\n${matchedClauses.map((c) => `  - ${c.documentTitle} ${c.clauseNumber} — ${c.heading}`).join("\n")}\n`
      : "";
    return (
      `Dealer request "${subject}" (${category}) from ${outletName}: ${description}\n\n` +
      `Criticality: ${criticality} — ${criticalityReason}\n\n` +
      `Suggested first action: ${playbook}${clausesBlock}\n\n` +
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
    const base = `You are drafting an internal document for an oil-company retail network operations team. Be concise and professional.`;
    return `${base}\n\nDocument type: ${kind}\nContext (JSON): ${JSON.stringify(ctx, null, 2)}\n\nDraft the document now.`;
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
