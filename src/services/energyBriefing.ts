/**
 * SO Cockpit — daily energy-sector news + crude-oil rate, fetched live (zero-dependency, native
 * fetch) on every request so a page refresh always tries for the real current figure, per the
 * user's explicit choice of a live source over manual-only entry. Two real, keyless public
 * sources (no API key/registration required, so nothing here is gated behind a credential this
 * app doesn't have):
 *   - Crude price: Stooq's public CSV quote endpoint (WTI continuous futures, symbol "cl.f").
 *   - Energy news: Google News' public RSS search feed.
 * Either source can fail for reasons entirely outside this app's control (network policy,
 * firewall, the source changing its response format) — on any failure this returns an explicit
 * `{ ok: false, error }` rather than a fabricated number/headline, and the route layer falls back
 * to the SO's own manual entry (see EnergyManualEntry) if one exists for today.
 */
import type { CrudeRateResult, EnergyNewsResult } from "../types.js";

const FETCH_TIMEOUT_MS = 8000;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function fetchCrudeRate(): Promise<CrudeRateResult> {
  try {
    const res = await fetch("https://stooq.com/q/l/?s=cl.f&f=sd2t2ohlcv&h&e=csv", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Stooq returned HTTP ${res.status}` };
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { ok: false, error: "Unexpected response format from Stooq (no data row)" };
    const header = lines[0]!.split(",").map((h: string) => h.trim().toLowerCase());
    const row = lines[1]!.split(",");
    const dateIdx = header.indexOf("date");
    const closeIdx = header.indexOf("close");
    if (closeIdx === -1 || row[closeIdx] === undefined) return { ok: false, error: "Unexpected response format from Stooq (no close column)" };
    const priceUsd = Number(row[closeIdx]);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return { ok: false, error: "Stooq returned a non-numeric or zero price (market likely closed/no data)" };
    return {
      ok: true,
      symbol: "WTI Crude (CL.F, continuous futures)",
      priceUsd,
      asOf: dateIdx !== -1 ? row[dateIdx] ?? "" : "",
      source: "stooq.com",
    };
  } catch (err) {
    return { ok: false, error: `Live crude-rate fetch failed: ${(err as Error).message}` };
  }
}

export async function fetchEnergyNews(): Promise<EnergyNewsResult> {
  try {
    const res = await fetch("https://news.google.com/rss/search?q=crude+oil+OR+energy+sector+India&hl=en-IN&gl=IN&ceid=IN:en", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Google News returned HTTP ${res.status}` };
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
    if (items.length === 0) return { ok: false, error: "Unexpected response format from Google News (no items found)" };
    const headlines = items
      .map((m) => {
        const block = m[1]!;
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
        if (!titleMatch) return null;
        return { title: decodeXmlEntities(titleMatch[1]!.trim()), link: linkMatch ? linkMatch[1]!.trim() : "" };
      })
      .filter((h): h is { title: string; link: string } => h !== null);
    if (headlines.length === 0) return { ok: false, error: "Google News response had no readable headlines" };
    return { ok: true, headlines, source: "news.google.com" };
  } catch (err) {
    return { ok: false, error: `Live energy-news fetch failed: ${(err as Error).message}` };
  }
}
