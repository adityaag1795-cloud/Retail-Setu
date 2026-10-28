/**
 * Module 1 outlet page — real local news for the outlet's own district (political movement, new
 * infrastructure development) that could signal upcoming footfall/competition shifts, fetched
 * live from Google News' public RSS search feed (see newsFeed.ts). Never a fabricated headline —
 * an outlet with no district on file, or a feed failure, returns an explicit `{ ok: false, error }`.
 */
import type { NewsFeedResult } from "../types.js";
import { fetchGoogleNewsRss } from "./newsFeed.js";

export function fetchDistrictNews(district: string | undefined): Promise<NewsFeedResult> {
  if (!district) return Promise.resolve({ ok: false, error: "No district on file for this outlet" });
  return fetchGoogleNewsRss(`${district} district infrastructure development OR political`);
}
