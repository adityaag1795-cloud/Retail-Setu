import type { PolicyClause, PolicyAnswer } from "../types.js";
import { store } from "../store.js";
import { getAiEngine } from "./aiEngine.js";

/**
 * Retrieval over the full loaded policy corpus (Dealer Selection Guidelines Annexure V/W1/Y —
 * every checklist item indexed individually, not just a summary — Resitement Guidelines, EAM,
 * Corpus Fund Scheme, and the real IRR/GST circular constants also used elsewhere in the app).
 * Every clause here is real, sourced text — this only changes how well a question finds the
 * right one among them: whole-word overlap alone under-ranks a clause that uses different but
 * related wording, and gives a common word the same weight as a rare, distinctive one. This adds:
 *  - IDF-style term weighting (a term that appears in only a few clauses counts far more than one
 *    that's in half the corpus — "asc" or "resitement" should outweigh "the" or "land"),
 *  - a verbatim-phrase bonus (two- and three-word runs from the question that appear as a phrase
 *    in the clause text are strong evidence, stronger than the same words scattered separately),
 *  - a document-title / clause-number exact-mention bonus (asking about "Annexure V" or "clause
 *    5.2" should surface that exact clause even if no other word overlaps), and
 *  - a loose substring fallback (only used when the strict pass finds nothing) so a genuinely
 *    relevant clause with slightly different phrasing still surfaces instead of a flat "no match".
 * References are then scoped to a single document (see matchClauses) — a question gets specific
 * clauses from the one most relevant policy, not a scatter of citations across several.
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

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function clauseHaystack(c: PolicyClause): string {
  return `${c.heading} ${c.text} ${c.tags.join(" ")}`.toLowerCase();
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

function phraseBonus(question: string, haystack: string, terms: string[]): number {
  let bonus = 0;
  const words = question
    .toLowerCase()
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

function score(clause: PolicyClause, question: string, terms: string[], idf: Map<string, number>): number {
  const haystack = clauseHaystack(clause);
  let s = 0;
  for (const term of terms) {
    if (new RegExp(`\\b${term}\\b`).test(haystack)) s += idf.get(term) ?? 1;
  }
  s += phraseBonus(question, haystack, terms);
  // Exact mention of the document title or clause number (e.g. "annexure v", "clause 5.2.a") is
  // strong, specific evidence — a reader naming the source is usually right about it.
  const qLower = question.toLowerCase();
  if (clause.clauseNumber.length > 2 && qLower.includes(clause.clauseNumber.toLowerCase())) s += 15;
  if (qLower.includes(clause.documentTitle.toLowerCase().split(" (")[0]!.slice(0, 40))) s += 5;
  return s;
}

/**
 * Answers should read like they came from one governing document, not a scatter of citations
 * across unrelated policies for a single question. So after scoring every clause, this picks the
 * single best-matching DOCUMENT (the one holding the highest-scoring individual clause — a
 * document with one very strong hit beats one with several weak scattered ones) and returns only
 * that document's own top-scoring clauses, up to `limit`.
 */
export function matchClauses(question: string, limit = 3): PolicyClause[] {
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

export async function askPolicyBot(question: string): Promise<PolicyAnswer> {
  const matchedClauses = matchClauses(question, 3);
  const answer = await getAiEngine().generate("policyAnswer", { question, matchedClauses });
  return { question, matchedClauses, answer };
}
