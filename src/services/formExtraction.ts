/**
 * Best-effort field extraction for an uploaded dealer Application Form.
 *
 * This environment has no network access to a vision/OCR service, so this is NOT true OCR —
 * it only works on text that's actually extractable (a text layer in a PDF/DOCX, or a plain
 * .txt/.md upload). A scanned image with no text layer will extract nothing and the SO must
 * fill the Application Form fields in by hand, same as today. Every extracted field is a
 * suggestion the SO reviews before "Save application" actually commits it — nothing here
 * writes to the case directly.
 */
import type { ApplicationForm } from "../types.js";

type ExtractableField = Exclude<keyof ApplicationForm, "otherFields">;

/** Label variants (case-insensitive) mapped to the ApplicationForm field they fill. */
const LABELS: { field: ExtractableField; patterns: RegExp[] }[] = [
  { field: "applicationNo", patterns: [/application\s*(?:no\.?|number)\s*[:\-]\s*(.+)/i] },
  { field: "applicantName", patterns: [/applicant(?:'s)?\s*name\s*[:\-]\s*(.+)/i, /name of applicant\s*[:\-]\s*(.+)/i] },
  { field: "fatherOrSpouseName", patterns: [/father'?s?\s*\/?\s*(?:husband'?s?|spouse'?s?)?\s*name\s*[:\-]\s*(.+)/i, /father'?s\/husband'?s name\s*[:\-]\s*(.+)/i] },
  { field: "spouseName", patterns: [/spouse\s*name\s*[:\-]\s*(.+)/i] },
  { field: "address", patterns: [/(?:residential\s*)?address\s*[:\-]\s*(.+)/i] },
  { field: "district", patterns: [/district\s*[:\-]\s*(.+)/i] },
  { field: "state", patterns: [/state\s*[:\-]\s*(.+)/i] },
  { field: "landKhasraKhatouniNo", patterns: [/khasra\s*\/?\s*khatouni\s*no\.?\s*[:\-]\s*(.+)/i] },
  { field: "revenueVillage", patterns: [/revenue\s*village\s*[:\-]\s*(.+)/i, /village\s*[:\-]\s*(.+)/i] },
  { field: "tehsil", patterns: [/tehsil\s*[:\-]\s*(.+)/i] },
  { field: "landDetails", patterns: [/land\s*details\s*[:\-]\s*(.+)/i] },
];

const NUMERIC_LABELS: { field: "frontageM" | "depthM" | "areaSqM"; patterns: RegExp[] }[] = [
  { field: "frontageM", patterns: [/frontage\s*\(?m\)?\s*[:\-]\s*([\d.]+)/i] },
  { field: "depthM", patterns: [/depth\s*\(?m\)?\s*[:\-]\s*([\d.]+)/i] },
  { field: "areaSqM", patterns: [/area\s*\(?sq\.?\s*m\.?\)?\s*[:\-]\s*([\d.]+)/i] },
];

const CATEGORY_WORDS = ["OPEN", "SC", "ST", "OBC", "PH", "DP", "ExSM"];
const GROUP_WORDS = ["Group 1", "Group 2", "Group 3"];
const TYPE_OF_RO_WORDS = ["Regular", "Rural"];
const OWNERSHIP_WORDS = ["Owned", "Leased", "Family"];

export interface ExtractionResult {
  fields: Partial<Record<ExtractableField, string | number>>;
  warnings: string[];
}

export function extractApplicationFormFields(rawText: string): ExtractionResult {
  const text = (rawText ?? "").trim();
  const fields: ExtractionResult["fields"] = {};
  const warnings: string[] = [];

  if (!text) {
    return { fields, warnings: ["No extractable text found in the upload — likely a scanned image with no text layer. OCR is not available in this environment; please fill the Application Form fields in manually."] };
  }

  for (const { field, patterns } of LABELS) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        fields[field] = m[1].trim().split("\n")[0]!.trim();
        break;
      }
    }
  }
  for (const { field, patterns } of NUMERIC_LABELS) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        fields[field] = Number(m[1]);
        break;
      }
    }
  }
  for (const w of CATEGORY_WORDS) {
    if (new RegExp(`\\b${w}\\b`).test(text) && new RegExp(`category\\s*[:\\-]?\\s*${w}\\b`, "i").test(text)) {
      fields.applicantCategory = w;
      break;
    }
  }
  for (const w of GROUP_WORDS) {
    if (text.includes(w)) {
      fields.group = w;
      break;
    }
  }
  for (const w of TYPE_OF_RO_WORDS) {
    if (new RegExp(`type of ro\\s*[:\\-]?\\s*${w}`, "i").test(text)) {
      fields.typeOfRO = w;
      break;
    }
  }
  for (const w of OWNERSHIP_WORDS) {
    if (new RegExp(`ownership\\s*(?:type)?\\s*[:\\-]?\\s*${w}`, "i").test(text)) {
      fields.ownershipType = w;
      break;
    }
  }

  const found = Object.keys(fields).length;
  if (found === 0) {
    warnings.push("Recognised no labelled fields in this text (expected labels like \"Applicant Name:\", \"District:\", \"Frontage (m):\" etc.) — the source document's layout may not match. Please review and fill fields in manually.");
  } else {
    warnings.push(`Extracted ${found} field(s) from the upload as a best-effort text match — review every value before saving, this is not verified OCR.`);
  }
  return { fields, warnings };
}
