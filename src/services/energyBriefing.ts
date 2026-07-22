/**
 * SO Cockpit — daily energy-sector news + crude-oil rate, fetched live (zero-dependency, native
 * fetch) on every request so a page refresh always tries for the real current figure, per the
 * user's explicit choice of a live source over manual-only entry. Two real, keyless public
 * sources (no API key/registration required, so nothing here is gated behind a credential this
 * app doesn't have):
 *   - Crude price: Stooq's public historical-daily CSV endpoint (WTI continuous futures, "cl.f").
 *   - Energy news: Google News' public RSS search feed (see newsFeed.ts).
 * Either source can fail for reasons entirely outside this app's control (network policy,
 * firewall, the source changing its response format) — on any failure this returns an explicit
 * `{ ok: false, error }` rather than a fabricated number/headline, and the route layer falls back
 * to the SO's own manual entry (see EnergyManualEntry) if one exists for today.
 */
import type { CrudeRateResult, NewsFeedResult } from "../types.js";
import { fetchGoogleNewsRss } from "./newsFeed.js";

const FETCH_TIMEOUT_MS = 8000;

export async function fetchCrudeRate(): Promise<CrudeRateResult> {
  try {
    // The old "/q/l/" live-quote-snapshot endpoint 404s (confirmed against the real host — Stooq
    // appears to have retired/moved it). This is Stooq's documented historical-daily CSV endpoint
    // (the one pandas-datareader and similar tools use), so it returns the latest completed
    // trading day's close rather than an intraday tick — an honest end-of-day figure, not a
    // fabricated "live" one.
    const res = await fetch("https://stooq.com/q/d/l/?s=cl.f&i=d", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Stooq returned HTTP ${res.status}` };
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { ok: false, error: "Unexpected response format from Stooq (no data row)" };
    const header = lines[0]!.split(",").map((h: string) => h.trim().toLowerCase());
    const lastRow = lines[lines.length - 1]!.split(",");
    const dateIdx = header.indexOf("date");
    const closeIdx = header.indexOf("close");
    if (closeIdx === -1 || lastRow[closeIdx] === undefined) return { ok: false, error: "Unexpected response format from Stooq (no close column)" };
    const priceUsd = Number(lastRow[closeIdx]);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return { ok: false, error: "Stooq returned a non-numeric or zero price (market likely closed/no data)" };
    return {
      ok: true,
      symbol: "WTI Crude (CL.F, continuous futures)",
      priceUsd,
      asOf: dateIdx !== -1 ? lastRow[dateIdx] ?? "" : "",
      source: "stooq.com (latest completed trading day's close)",
    };
  } catch (err) {
    return { ok: false, error: `Live crude-rate fetch failed: ${(err as Error).message}` };
  }
}

export function fetchEnergyNews(): Promise<NewsFeedResult> {
  return fetchGoogleNewsRss("crude oil OR energy sector India");
}
