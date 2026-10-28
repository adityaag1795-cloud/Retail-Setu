/**
 * Shared Google News RSS fetch + parse helper (zero-dependency, native fetch, no API key/
 * registration required). Used by both the SO Cockpit's energy-sector feed (energyBriefing.ts)
 * and the per-outlet district news feed (districtNews.ts). On any failure — network policy,
 * firewall, the feed changing its response format — this returns an explicit
 * `{ ok: false, error }` rather than a fabricated headline.
 */
import type { NewsFeedResult } from "../types.js";

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

export async function fetchGoogleNewsRss(query: string): Promise<NewsFeedResult> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
    return { ok: false, error: `Live news fetch failed: ${(err as Error).message}` };
  }
}
