import type { PolicyClause, PolicyAnswer } from "../types.js";
import { store } from "../store.js";
import { getAiEngine } from "./aiEngine.js";

/** Very small keyword-overlap scorer — swap for embeddings-based retrieval once a real corpus exists. */
function score(clause: PolicyClause, terms: string[]): number {
  const haystack = `${clause.heading} ${clause.text} ${clause.tags.join(" ")}`.toLowerCase();
  return terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
}

export function matchClauses(question: string, limit = 3): PolicyClause[] {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
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
