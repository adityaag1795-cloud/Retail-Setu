import { readZipEntries } from "./zipReader.js";

/**
 * Minimal zero-dependency .docx text reader — a .docx is a ZIP of XML parts; word/document.xml
 * holds the body as <w:p> paragraphs of <w:t> runs. Good enough to recover the real text of a
 * digitally-authored Application Form upload (no formatting/tables structure preserved).
 */
export function extractDocxText(buf: Buffer): string {
  const entries = readZipEntries(buf);
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc) return "";
  const xml = doc.data.toString("utf-8");
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const lines = paragraphs.map((p) => {
    const runs = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? "");
    return decodeXmlEntities(runs.join(""));
  });
  return lines.join("\n");
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
