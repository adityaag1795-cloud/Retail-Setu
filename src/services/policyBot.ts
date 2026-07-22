import type { PolicyClause, PolicyAnswer } from "../types.js";
import { store } from "../store.js";
import { getAiEngine } from "./aiEngine.js";

/**
 * Retrieval over the full loaded policy corpus (Dealer Selection Guidelines — every numbered
 * section plus every ASC/LEC/FVC checklist item indexed individually, not just a summary —
 * Empowerment & Authority Manual, Resitement Guidelines, Corpus Fund Scheme, and the real IRR/GST
 * circular constants also used elsewhere in the app). Every clause here is real, sourced text —
 * this only changes how well a question finds the right one among them, aiming for "the essence
 * of the question" rather than literal word overlap:
 *  - IDF-style term weighting (a term that appears in only a few clauses counts far more than one
 *    that's in half the corpus — "asc" or "resitement" should outweigh "the" or "land"),
 *  - a light stemmer (approve/approves/approved/approval/approving all reduce to the same root),
 *    scored as secondary evidence alongside exact-word matches so "who approves X" still finds a
 *    clause that only says "approval authority" without a real verb-form match,
 *  - a verbatim-phrase bonus (two- and three-word runs from the question that appear as a phrase
 *    in the clause text are strong evidence, stronger than the same words scattered separately),
 *  - a question-intent bonus (a "who" question is really asking for an authority/designation; a
 *    "how much"/"what fee" question wants a number/currency; a "when"/"how long" question wants a
 *    duration — clauses that actually contain that *kind* of answer get a boost, so the match
 *    reflects what the question is actually after, not just which words it shares),
 *  - a document-title / clause-number exact-mention bonus (asking about "Annexure V" or "clause
 *    5.2" should surface that exact clause even if no other word overlaps), and
 *  - a loose substring fallback (only used when the strict pass finds nothing) so a genuinely
 *    relevant clause with slightly different phrasing still surfaces instead of a flat "no match".
 * References are then scoped to a single document (see matchClauses) — a question gets specific
 * clauses from the one most relevant policy, not a scatter of citations across several. When a
 * real Gen AI engine is configured (ANTHROPIC_API_KEY), askPolicyBot also hands it a wider,
 * multi-document candidate pool (matchClausesWide) so it can reason semantically over more real
 * material before still narrowing to one governing document in its answer.
 */

// Generic connector words long enough to pass the length filter but too common to mean anything —
// "not" is a real whole word inside several clauses (e.g. "reasons not attributable to dealer"),
// so on its own it produced a technically-correct but meaningless match once free-text Module 7
// descriptions started feeding this same matcher.
const STOPWORDS = new Set([
  "not", "with", "from", "this", "that", "have", "are", "for", "the", "and", "any", "all", "can",
  "will", "was", "been", "has", "had", "what", "when", "does", "who", "how", "why", "should", "would",
  "could", "there", "their", "which", "into", "than", "then", "also", "such", "only", "each", "per",
]);

/**
 * These policy documents are written almost entirely in their own real abbreviations (RO, SD, LOI,
 * FVC, LEC, EAM, CFS...) — each one is defined in the source document itself, not invented here. A
 * question phrased in plain English ("retail outlet", "security deposit") should still find a
 * clause that only ever says "RO" or "SD", and vice versa. Applied as a raw-string substitution
 * before tokenizing (both the question and the clause haystack go through this), each match adds
 * the abbreviation and its expansion side by side so either phrasing lands on the same tokens.
 * Two-to-three letter abbreviations are otherwise invisible to this matcher — tokenize()'s
 * `length > 2` filter and phraseBonus's word-length guard both exist to keep out noise words like
 * "of"/"an"/"to", which would otherwise swamp scoring with meaningless short-word overlap.
 */
const ABBREV_EXPAND: [RegExp, string][] = [
  [/\bretail outlets?\b/g, "retailoutlet ro"],
  [/\bros\b/g, "ro retailoutlet"],
  [/\bro\b/g, "ro retailoutlet"],
  [/\bletter of intent\b/g, "loi letterofintent"],
  [/\bloi\b/g, "loi letterofintent"],
  [/\bletter of award\b/g, "loa letterofaward"],
  [/\bloa\b/g, "loa letterofaward"],
  [/\bsecurity deposits?\b/g, "sd securitydeposit"],
  [/\bsd\b/g, "sd securitydeposit"],
  [/\binitial security deposits?\b/g, "isd initialsecuritydeposit"],
  [/\bisd\b/g, "isd initialsecuritydeposit"],
  [/\bfield verification of credentials?\b/g, "fvc fieldverification"],
  [/\bfvc\b/g, "fvc fieldverification"],
  [/\bland evaluation committee\b/g, "lec landevaluation"],
  [/\blec\b/g, "lec landevaluation"],
  [/\badditional site clearance\b/g, "asc additionalsiteclearance"],
  [/\basc\b/g, "asc additionalsiteclearance"],
  [/\bempowerment\s*(?:&|and)?\s*authority manual\b/g, "eam empowermentauthority"],
  [/\beam\b/g, "eam empowermentauthority"],
  [/\bdealer selection guidelines?\b/g, "dsg dealerselection"],
  [/\bdsg\b/g, "dsg dealerselection"],
  [/\bregional bids committee\b/g, "rbc regionalbids"],
  [/\brbc\b/g, "rbc regionalbids"],
  [/\bcorpus fund scheme\b/g, "cfs corpusfund"],
  [/\bcfs\b/g, "cfs corpusfund"],
];

function expandAbbreviations(s: string): string {
  let out = s.toLowerCase();
  for (const [pattern, replacement] of ABBREV_EXPAND) out = out.replace(pattern, replacement);
  return out;
}

function tokenize(s: string): string[] {
  return expandAbbreviations(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Light suffix-stripping stemmer — not a full Porter stemmer, just enough to collapse the common
 * verb/noun-form variants that show up in real questions ("who approves" vs a clause that says
 * "approval authority") onto the same root. Order matters: strip inflectional endings first, then
 * derivational ones, then a trailing silent "e" so "approve"/"approves"/"approved"/"approval" all
 * land on "approv".
 */
function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ion")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("al")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

function clauseHaystack(c: PolicyClause): string {
  return expandAbbreviations(`${c.heading} ${c.text} ${c.tags.join(" ")}`);
}

/** Document frequency of each term across the whole loaded corpus — computed fresh each call, cheap at this corpus size. */
function buildIdf(clauses: PolicyClause[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of clauses) {
    const seen = new Set(tokenize(clauseHaystack(c)));
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  const n = clauses.length || 1;
  for (const [term, docFreq] of df) idf.set(term, Math.log((n + 1) / docFreq));
  return idf;
}

function phraseBonus(question: string, haystack: string): number {
  let bonus = 0;
  const words = expandAbbreviations(question)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len);
      if (phrase.some((w) => STOPWORDS.has(w) || w.length <= 2)) continue;
      if (haystack.includes(phrase.join(" "))) bonus += len * 2;
    }
  }
  return bonus;
}

/** Words that plausibly answer each question "type" — a cheap stand-in for understanding intent. */
const INTENT_SIGNALS: { pattern: RegExp; answerWords: RegExp }[] = [
  { pattern: /\bwho\b|\bwhom\b|responsible|authority/, answerWords: /\b(head|committee|board|director|manager|officer|cfd|rbc|zone|region|gm|dgm|approv|sanction)\w*\b/g },
  { pattern: /how much|how many|what.{0,10}(fee|amount|limit|cost|rate|deposit|margin|threshold)/, answerWords: /(rs\.?\s?\d|r\s?\d|\d+\s?%|\d+\s?(lakh|crore|kl))/g },
  { pattern: /\bwhen\b|how long|how soon|time period|deadline|within/, answerWords: /\b(\d+\s?(day|days|month|months|year|years|hour|hours))\b/g },
];

function intentBonus(question: string, haystack: string): number {
  const qLower = question.toLowerCase();
  let bonus = 0;
  for (const { pattern, answerWords } of INTENT_SIGNALS) {
    if (pattern.test(qLower)) {
      const hits = haystack.match(answerWords);
      if (hits) bonus += Math.min(hits.length, 4) * 3;
    }
  }
  return bonus;
}

function score(clause: PolicyClause, question: string, terms: string[], idf: Map<string, number>): number {
  const haystack = clauseHaystack(clause);
  const haystackTerms = new Set(tokenize(haystack));
  const haystackStems = new Set([...haystackTerms].map(stem));
  let s = 0;
  for (const term of terms) {
    if (haystackTerms.has(term)) {
      s += idf.get(term) ?? 1;
    } else if (haystackStems.has(stem(term))) {
      // Same root, different inflection (e.g. question says "approves", clause says "approval") —
      // real evidence, but weaker than an exact match since stemming is a blunt instrument.
      s += (idf.get(term) ?? 1) * 0.6;
    }
  }
  s += phraseBonus(question, haystack);
  s += intentBonus(question, haystack);
  // Exact mention of the document title or clause number (e.g. "annexure v", "clause 5.2.a") is
  // strong, specific evidence — a reader naming the source is usually right about it.
  const qLower = question.toLowerCase();
  if (clause.clauseNumber.length > 2 && qLower.includes(clause.clauseNumber.toLowerCase())) s += 15;
  if (qLower.includes(clause.documentTitle.toLowerCase().split(" (")[0]!.slice(0, 40))) s += 5;
  return s;
}

function scoreAll(question: string): { clause: PolicyClause; s: number }[] {
  const all = [...store.policyClauses.values()];
  const terms = tokenize(question);
  const idf = buildIdf(all);

  let scored = all.map((c) => ({ clause: c, s: score(c, question, terms, idf) })).filter((x) => x.s > 0);

  if (scored.length === 0) {
    // Loose fallback: strict whole-word matching found nothing — try plain substring matching
    // (handles plurals, hyphenation, and word-boundary misses) before giving up entirely.
    scored = all
      .map((c) => {
        const haystack = clauseHaystack(c);
        const hits = terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
        return { clause: c, s: hits };
      })
      .filter((x) => x.s > 0);
  }
  return scored.sort((a, b) => b.s - a.s);
}

/**
 * Answers should read like they came from one governing document, not a scatter of citations
 * across unrelated policies for a single question. So after scoring every clause, this picks the
 * single best-matching DOCUMENT (the one holding the highest-scoring individual clause — a
 * document with one very strong hit beats one with several weak scattered ones) and returns only
 * that document's own top-scoring clauses, up to `limit`.
 */
export function matchClauses(question: string, limit = 3): PolicyClause[] {
  const scored = scoreAll(question);
  if (scored.length === 0) return [];

  const byDoc = new Map<string, { clause: PolicyClause; s: number }[]>();
  for (const item of scored) {
    const list = byDoc.get(item.clause.documentTitle) ?? [];
    list.push(item);
    byDoc.set(item.clause.documentTitle, list);
  }
  let bestDoc = "";
  let bestDocScore = -Infinity;
  for (const [doc, items] of byDoc) {
    const top = Math.max(...items.map((i) => i.s));
    if (top > bestDocScore) {
      bestDocScore = top;
      bestDoc = doc;
    }
  }
  return byDoc
    .get(bestDoc)!
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.clause);
}

/**
 * A wider, multi-document candidate pool (not restricted to one document) — used only to give a
 * real Gen AI engine more raw material to reason over. The offline template engine never sees
 * this; it always answers from matchClauses' single-document set.
 */
export function matchClausesWide(question: string, limit = 8): PolicyClause[] {
  return scoreAll(question)
    .slice(0, limit)
    .map((x) => x.clause);
}

export async function askPolicyBot(question: string): Promise<PolicyAnswer> {
  const matchedClauses = matchClauses(question, 3);
  const candidatePool = matchClausesWide(question, 8);
  const answer = await getAiEngine().generate("policyAnswer", { question, matchedClauses, candidatePool });
  return { question, matchedClauses, answer };
}
