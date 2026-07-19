import type { PolicyClause, PolicyAnswer } from "../types.js";
import { store } from "../store.js";
import { getAiEngine } from "./aiEngine.js";

/**
 * Very small keyword-overlap scorer — swap for embeddings-based retrieval once a real corpus
 * exists. Matches whole words only (word-boundary regex, not substring `includes`) — a plain
 * substring check would match "not" inside "notarized", "sap" inside "disappear", etc., which
 * surfaced as visibly wrong clause citations once Module 7 started feeding free-text descriptions
 * into this same matcher.
 */
function score(clause: PolicyClause, terms: string[]): number {
  const haystack = `${clause.heading} ${clause.text} ${clause.tags.join(" ")}`.toLowerCase();
  return terms.reduce((acc, term) => (new RegExp(`\\b${term}\\b`).test(haystack) ? acc + 1 : acc), 0);
}

// Generic connector words long enough to pass the length filter but too common to mean anything —
// "not" is a real whole word inside several clauses (e.g. "reasons not attributable to dealer"),
// so on its own it produced a technically-correct but meaningless match once free-text Module 7
// descriptions started feeding this same matcher.
const STOPWORDS = new Set(["not", "with", "from", "this", "that", "have", "are", "for", "the", "and", "any", "all", "can", "will", "was", "been", "has", "had"]);

export function matchClauses(question: string, limit = 3): PolicyClause[] {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const scored = [...store.policyClauses.values()]
    .map((c) => ({ clause: c, s: score(c, terms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.clause);
}

export async function askPolicyBot(question: string): Promise<PolicyAnswer> {
  const matchedClauses = matchClauses(question);
  const answer = await getAiEngine().generate("policyAnswer", { question, matchedClauses });
  return { question, matchedClauses, answer };
}
