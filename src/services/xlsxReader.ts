import { inflateRawSync } from "node:zlib";

/**
 * Minimal zero-dependency .xlsx reader — same technique as the KMZ reader in kml.ts (a .xlsx is
 * a ZIP of XML parts, just like a .kmz). Reads local-file-header entries (stored or deflated),
 * enough to pull sharedStrings.xml and the first worksheet out of a real uploaded workbook.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset < buf.length - 4 && buf.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.toString("utf-8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (compressionMethod === 0) data = Buffer.from(raw);
    else if (compressionMethod === 8) data = inflateRawSync(raw);
    else data = Buffer.alloc(0);
    entries.push({ name, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siBlocks = xml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
  for (const block of siBlocks) {
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1] ?? ""));
    strings.push(texts.join(""));
  }
  return strings;
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function colToIndex(col: string): number {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function parseSheetRows(xml: string, sharedStrings: string[]): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  const rowBlocks = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
  for (const rowBlock of rowBlocks) {
    const cells: (string | number | null)[] = [];
    const cellBlocks = [...rowBlock.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)];
    for (const cm of cellBlocks) {
      const attrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const colLetters = refMatch?.[1];
      const idx = colLetters ? colToIndex(colLetters) : cells.length;
      let value: string | number | null = null;
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
      if (isMatch) {
        const isInner = isMatch[1] ?? "";
        value = decodeXmlEntities([...isInner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "").join(""));
      } else if (vMatch) {
        const raw = vMatch[1] ?? "";
        if (typeMatch?.[1] === "s") value = sharedStrings[Number(raw)] ?? "";
        else if (typeMatch?.[1] === "str") value = decodeXmlEntities(raw);
        else if (typeMatch?.[1] === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else value = Number(raw);
      }
      while (cells.length < idx) cells.push(null);
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

export interface ParsedSheet {
  header: string[];
  rows: (string | number | null)[][];
}

/** Parses the first worksheet of an uploaded .xlsx buffer into a header row + data rows. */
export function parseXlsxFirstSheet(buf: Buffer): ParsedSheet {
  const entries = readZipEntries(buf);
  const sharedStringsEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(sharedStringsEntry.data.toString("utf-8")) : [];
  const sheetEntry =
    entries.find((e) => e.name === "xl/worksheets/sheet1.xml") ??
    entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!sheetEntry) throw new Error("No worksheet found in the uploaded .xlsx file");
  const allRows = parseSheetRows(sheetEntry.data.toString("utf-8"), sharedStrings);
  const [header, ...rows] = allRows;
  return { header: (header ?? []).map((h) => String(h ?? "").trim()), rows };
}

/**
 * Same as parseXlsxFirstSheet but returns every row raw, with no header/data split — for real
 * fixed-layout exports (like the RELCON DU transaction report) whose header isn't row 1.
 */
export function parseXlsxAllRows(buf: Buffer): (string | number | null)[][] {
  const entries = readZipEntries(buf);
  const sharedStringsEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(sharedStringsEntry.data.toString("utf-8")) : [];
  const sheetEntry =
    entries.find((e) => e.name === "xl/worksheets/sheet1.xml") ??
    entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!sheetEntry) throw new Error("No worksheet found in the uploaded .xlsx file");
  return parseSheetRows(sheetEntry.data.toString("utf-8"), sharedStrings);
}

/** Parses a simple CSV (comma-separated, quote-aware) into the same header + rows shape. */
export function parseCsv(text: string): ParsedSheet {
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  };
  const [header, ...rest] = lines.map(parseLine);
  return { header: (header ?? []).map((h) => h.trim()), rows: rest };
}

/** Finds a column value by header name, case-insensitive, tolerant of extra whitespace. */
export function cellByHeader(header: string[], row: (string | number | null)[], name: string): string | number | null {
  const idx = header.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());
  return idx === -1 ? null : (row[idx] ?? null);
}
