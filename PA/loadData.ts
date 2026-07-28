import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgeBracket, PAOutlet, PAOutletWithAge } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "outlets.json");

let cache: PAOutlet[] | null = null;

/** Loads and caches the full 4,928-outlet PA roster. */
export function loadOutlets(): PAOutlet[] {
  if (!cache) {
    cache = JSON.parse(readFileSync(DATA_PATH, "utf8")) as PAOutlet[];
  }
  return cache;
}

const DAYS_PER_YEAR = 365.25;

export function ageYears(commDate: string, asOf: Date = new Date()): number {
  const commissioned = new Date(commDate);
  const days = (asOf.getTime() - commissioned.getTime()) / 86_400_000;
  return Number(Math.max(0, days / DAYS_PER_YEAR).toFixed(2));
}

export function ageBracketFor(years: number): AgeBracket {
  if (years < 5) return "0-5 yrs";
  if (years < 10) return "5-10 yrs";
  if (years < 20) return "10-20 yrs";
  if (years < 30) return "20-30 yrs";
  return "30+ yrs";
}

/** Attaches age-derived fields to every outlet, as of `asOf` (defaults to now). */
export function withAge(outlets: PAOutlet[], asOf: Date = new Date()): PAOutletWithAge[] {
  return outlets.map((o) => {
    const years = ageYears(o.commDate, asOf);
    return { ...o, ageYears: years, ageBracket: ageBracketFor(years) };
  });
}
