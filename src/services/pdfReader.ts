import { inflateSync } from "node:zlib";

/**
 * Minimal zero-dependency PDF text reader.
 *
 * This environment has no network access to a vision/OCR service and no OCR engine bundled, so
 * a genuinely scanned image PDF (no text layer at all) still can't be read — that limitation is
 * real and is reported honestly via `hasTextLayer: false`, not faked.
 *
 * For a normal "digitally created" PDF (typed in Word/LibreOffice, exported from Excel, printed
 * from a browser) the text IS there in the file, just not in a shape you can
 * `Buffer.toString()` your way through — it lives in per-page content streams (often
 * FlateDecode-compressed, decodable with node:zlib) as `Tj`/`TJ` text-showing operators, and for
 * embedded/subset fonts (the overwhelming majority of real-world PDFs) the string bytes are font
 * glyph codes, not characters — recovering real text needs each font's own `/ToUnicode` CMap
 * (`beginbfchar`/`beginbfrange` blocks) to map glyph code -> actual Unicode text.
 *
 * Crucially, a single PDF very often embeds several DIFFERENT subset fonts (e.g. one per style
 * run — this is exactly what Excel/LibreOffice Calc produces on "Save as PDF"), each defining
 * its own glyph-code space from scratch. Two different fonts can and do reuse the same byte
 * value for two completely different characters, so decoding must resolve, for each run of
 * shown text, exactly which font was active (via the preceding `Tf` operator and the page's own
 * `/Resources /Font` dictionary) and use THAT font's CMap — never one merged global lookup.
 */

export interface PdfExtraction {
  text: string;
  hasTextLayer: boolean;
}

interface PdfObject {
  dict: string;
  streamStart?: number;
  streamEnd?: number;
}

function unescapeLiteral(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const next = s[i + 1];
    if (next === "n") {
      out += "\n";
      i++;
    } else if (next === "r") {
      out += "\r";
      i++;
    } else if (next === "t") {
      out += "\t";
      i++;
    } else if (next === "(" || next === ")" || next === "\\") {
      out += next;
      i++;
    } else if (next === "\n" || next === "\r") {
      i++; // backslash-newline: line continuation, no output
    } else if (next && next >= "0" && next <= "7") {
      let oct = next;
      i++;
      for (let k = 0; k < 2 && s[i + 1] && s[i + 1]! >= "0" && s[i + 1]! <= "7"; k++) oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else {
      out += next ?? "";
      i++;
    }
  }
  return out;
}

function hexToUnicode(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

interface FontCMap {
  codeBytes: number; // width of one glyph code, from /codespacerange — 1 for simple fonts, 2 for Identity-H
  map: Map<number, string>;
}

/** Parses a decompressed `/ToUnicode` CMap stream: codespace byte-width + beginbfchar/beginbfrange blocks. */
function parseToUnicodeCMap(content: string): FontCMap {
  const rangeMatch = content.match(/begincodespacerange\s*\n?<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
  const codeBytes = rangeMatch ? rangeMatch[1]!.length / 2 : 1;
  const map = new Map<number, string>();
  for (const block of content.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, srcHex, dstHex] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(srcHex!, 16), hexToUnicode(dstHex!));
    }
  }
  for (const block of content.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const [, loHex, hiHex, dst] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(loHex!, 16);
      const hi = parseInt(hiHex!, 16);
      if (dst!.startsWith("[")) {
        const dstStrs = [...dst!.matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => m[1]!);
        for (let code = lo; code <= hi && code - lo < dstStrs.length; code++) map.set(code, hexToUnicode(dstStrs[code - lo]!));
      } else {
        const dstHex = dst!.slice(1, -1);
        const base = parseInt(dstHex, 16);
        for (let code = lo; code <= hi; code++) map.set(code, hexToUnicode((base + (code - lo)).toString(16).padStart(dstHex.length, "0")));
      }
    }
  }
  return { codeBytes, map };
}

/** Extracts the balanced `<< ... >>` dictionary starting at or after `from` in `text`. */
function extractDict(text: string, from: number): string {
  const start = text.indexOf("<<", from);
  if (start === -1) return "";
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith("<<", i)) {
      depth++;
      i += 2;
    } else if (text.startsWith(">>", i)) {
      depth--;
      i += 2;
      if (depth === 0) return text.slice(start, i);
    } else {
      i++;
    }
  }
  return text.slice(start);
}

function indirectRef(dict: string, key: string): number | undefined {
  const m = dict.match(new RegExp(`${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : undefined;
}

/** Parses every `N G obj ... endobj` in the file into a lookup by object number. */
function parseObjects(latin1: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const objRe = /(\d+)\s+\d+\s+obj/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(latin1))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endIdx = latin1.indexOf("endobj", bodyStart);
    if (endIdx === -1) continue;
    const body = latin1.slice(bodyStart, endIdx);
    const streamMatch = body.match(/stream\r?\n/);
    const obj: PdfObject = { dict: extractDict(body, 0) };
    if (streamMatch) {
      const streamStart = bodyStart + streamMatch.index! + streamMatch[0].length;
      let streamEnd = latin1.indexOf("endstream", streamStart);
      if (latin1[streamEnd - 1] === "\n") streamEnd--;
      if (latin1[streamEnd - 1] === "\r") streamEnd--;
      obj.streamStart = streamStart;
      obj.streamEnd = streamEnd;
    }
    objects.set(num, obj);
  }
  return objects;
}

function getStreamText(buf: Buffer, latin1: string, obj: PdfObject): string | undefined {
  if (obj.streamStart === undefined || obj.streamEnd === undefined) return undefined;
  const raw = buf.subarray(obj.streamStart, obj.streamEnd);
  if (/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode)/.test(obj.dict)) {
    try {
      return inflateSync(raw).toString("latin1");
    } catch {
      return undefined;
    }
  }
  if (/\/Filter/.test(obj.dict)) return undefined; // image/other codec — not text
  return latin1.slice(obj.streamStart, obj.streamEnd);
}

const STRING_TOKEN = `(?:\\((?:\\\\.|[^()\\\\])*\\)|<[0-9A-Fa-f\\s]*>)`;
const TOKEN_RE = new RegExp(`/(\\w+)\\s+[\\d.]+\\s+Tf|(${STRING_TOKEN})\\s*Tj|\\[((?:${STRING_TOKEN}|[^\\[\\]])*)\\]\\s*TJ|(T\\*|Td|TD)`, "g");
const STRING_TOKEN_RE = new RegExp(STRING_TOKEN, "g");

function decodeStringToken(tok: string, cmap: FontCMap | undefined): string {
  const bytes: number[] = [];
  if (tok.startsWith("(")) {
    const raw = unescapeLiteral(tok.slice(1, -1));
    for (let i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i) & 0xff);
  } else {
    const clean = tok.slice(1, -1).replace(/\s+/g, "");
    for (let i = 0; i + 2 <= clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (!cmap || cmap.map.size === 0) {
    // No CMap resolvable for the active font — fall back to a direct byte->char pass (simple, non-subset font).
    return bytes.map((b) => String.fromCharCode(b)).join("");
  }
  let out = "";
  const width = cmap.codeBytes;
  for (let i = 0; i + width <= bytes.length; i += width) {
    let code = 0;
    for (let k = 0; k < width; k++) code = (code << 8) | bytes[i + k]!;
    out += cmap.map.get(code) ?? "";
  }
  return out;
}

/** Walks one page's content stream, resolving the active font (via Tf) for every Tj/TJ run. */
function extractPageText(content: string, fontCMaps: Map<string, FontCMap>): string {
  const lines: string[] = [];
  let cur = "";
  let activeFont: string | undefined;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(content))) {
    if (m[1] !== undefined) {
      activeFont = m[1];
    } else if (m[2] !== undefined) {
      cur += decodeStringToken(m[2], fontCMaps.get(activeFont ?? ""));
    } else if (m[3] !== undefined) {
      STRING_TOKEN_RE.lastIndex = 0;
      let sm: RegExpExecArray | null;
      while ((sm = STRING_TOKEN_RE.exec(m[3]))) cur += decodeStringToken(sm[0], fontCMaps.get(activeFont ?? ""));
    } else if (m[4]) {
      lines.push(cur);
      cur = "";
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

export function extractPdfText(buf: Buffer): PdfExtraction {
  const latin1 = buf.toString("latin1");
  const objects = parseObjects(latin1);

  const getDict = (num: number | undefined): string => (num !== undefined ? (objects.get(num)?.dict ?? "") : "");

  const pageNums = [...objects.entries()]
    .filter(([, o]) => /\/Type\s*\/Page(?!s)/.test(o.dict))
    .map(([num]) => num)
    .sort((a, b) => a - b);

  const pages: string[] = [];
  for (const pageNum of pageNums) {
    const pageDict = objects.get(pageNum)!.dict;
    const resNum = indirectRef(pageDict, "/Resources");
    const resDict = resNum !== undefined ? getDict(resNum) : extractDict(pageDict, pageDict.indexOf("/Resources"));
    const fontDictNum = indirectRef(resDict, "/Font");
    const fontDict = fontDictNum !== undefined ? getDict(fontDictNum) : resDict;

    const fontCMaps = new Map<string, FontCMap>();
    for (const [, fname, fnumStr] of fontDict.matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
      const fontObj = objects.get(Number(fnumStr));
      if (!fontObj) continue;
      const tuNum = indirectRef(fontObj.dict, "/ToUnicode");
      const tuObj = tuNum !== undefined ? objects.get(tuNum) : undefined;
      if (!tuObj) continue;
      const cmapText = getStreamText(buf, latin1, tuObj);
      if (cmapText) fontCMaps.set(fname!, parseToUnicodeCMap(cmapText));
    }

    const contentsRef = pageDict.match(/\/Contents\s+(\d+)\s+\d+\s+R|\/Contents\s*\[([^\]]*)\]/);
    const contentNums = contentsRef
      ? contentsRef[1]
        ? [Number(contentsRef[1])]
        : [...(contentsRef[2] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]))
      : [];

    const pageText = contentNums
      .map((n) => objects.get(n))
      .filter((o): o is PdfObject => !!o)
      .map((o) => getStreamText(buf, latin1, o))
      .filter((t): t is string => !!t && /\bBT\b[\s\S]*\bET\b/.test(t))
      .map((t) => extractPageText(t, fontCMaps))
      .join("\n");
    if (pageText.trim()) pages.push(pageText);
  }

  const text = pages
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, hasTextLayer: text.length > 0 };
}
