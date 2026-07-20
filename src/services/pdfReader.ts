import { inflateSync } from "node:zlib";

/**
 * Minimal zero-dependency PDF text reader.
 *
 * This environment has no network access to a vision/OCR service and no OCR engine bundled, so
 * a genuinely scanned image PDF (no text layer at all) still can't be read — that limitation is
 * real and is reported honestly via `hasTextLayer: false`, not faked.
 *
 * For a normal "digitally created" PDF (typed in Word/LibreOffice, exported from a form tool,
 * printed to PDF from a browser) the text IS there in the file, just not in a shape you can
 * `Buffer.toString()` your way through — it lives in per-page content streams (often
 * FlateDecode-compressed, decodable with node:zlib) as `Tj`/`TJ` text-showing operators, and for
 * embedded/subset fonts (the overwhelming majority of real-world PDFs) the string bytes are font
 * glyph codes, not characters — recovering real text needs the font's `/ToUnicode` CMap
 * (`beginbfchar`/`beginbfrange` blocks) to map glyph code -> actual Unicode text. That's what
 * this does, without resolving the full PDF object/xref graph: every FlateDecode stream in the
 * file is decompressed and classified by content (a ToUnicode CMap vs. a page content stream),
 * CMaps are merged into one lookup, then content streams are decoded against it.
 */

export interface PdfExtraction {
  text: string;
  hasTextLayer: boolean;
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

function hexQuadsToUnicode(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

/** Parses a decompressed `/ToUnicode` CMap stream's `beginbfchar`/`beginbfrange` blocks. */
function parseToUnicodeCMap(content: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of content.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, srcHex, dstHex] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(srcHex!, 16), hexQuadsToUnicode(dstHex!));
    }
  }
  for (const block of content.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const [, loHex, hiHex, dst] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(loHex!, 16);
      const hi = parseInt(hiHex!, 16);
      if (dst!.startsWith("[")) {
        const dstStrs = [...dst!.matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => m[1]!);
        for (let code = lo; code <= hi && code - lo < dstStrs.length; code++) map.set(code, hexQuadsToUnicode(dstStrs[code - lo]!));
      } else {
        const dstHex = dst!.slice(1, -1);
        const base = parseInt(dstHex, 16);
        for (let code = lo; code <= hi; code++) map.set(code, hexQuadsToUnicode((base + (code - lo)).toString(16).padStart(dstHex.length, "0")));
      }
    }
  }
  return map;
}

function decodeHexString(hex: string, cmap: Map<number, string>): string {
  const clean = hex.replace(/\s+/g, "");
  if (cmap.size > 0) {
    let out = "";
    for (let i = 0; i + 4 <= clean.length; i += 4) out += cmap.get(parseInt(clean.slice(i, i + 4), 16)) ?? "";
    return out;
  }
  // No ToUnicode CMap in the whole file — assume a simple (non-subset) 1-byte-per-char font.
  let out = "";
  for (let i = 0; i + 2 <= clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

const STRING_TOKEN = `(?:\\((?:\\\\.|[^()\\\\])*\\)|<[0-9A-Fa-f\\s]*>)`;
const SHOW_TEXT_RE = new RegExp(`(${STRING_TOKEN})\\s*Tj|\\[((?:${STRING_TOKEN}|[^\\[\\]])*)\\]\\s*TJ|(T\\*|Td|TD)`, "g");
const STRING_TOKEN_RE = new RegExp(STRING_TOKEN, "g");

function decodeStringToken(tok: string, cmap: Map<number, string>): string {
  if (tok.startsWith("(")) return unescapeLiteral(tok.slice(1, -1));
  return decodeHexString(tok.slice(1, -1), cmap);
}

/** Walks a decompressed page content stream, pulling text out of Tj/TJ operators in order. */
function extractShowTextOps(content: string, cmap: Map<number, string>): string {
  const lines: string[] = [];
  let cur = "";
  let m: RegExpExecArray | null;
  SHOW_TEXT_RE.lastIndex = 0;
  while ((m = SHOW_TEXT_RE.exec(content))) {
    if (m[1] !== undefined) {
      cur += decodeStringToken(m[1], cmap);
    } else if (m[2] !== undefined) {
      STRING_TOKEN_RE.lastIndex = 0;
      let sm: RegExpExecArray | null;
      while ((sm = STRING_TOKEN_RE.exec(m[2]))) cur += decodeStringToken(sm[0], cmap);
    } else if (m[3]) {
      lines.push(cur);
      cur = "";
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

export function extractPdfText(buf: Buffer): PdfExtraction {
  const latin1 = buf.toString("latin1");
  const streamDictRe = /(<<[\s\S]*?>>)\s*stream\r?\n/g;
  const contentChunks: string[] = [];
  const cmapChunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = streamDictRe.exec(latin1))) {
    const dict = m[1] ?? "";
    const dataStart = m.index + m[0].length;
    const endIdx = latin1.indexOf("endstream", dataStart);
    if (endIdx === -1) break;
    let dataEnd = endIdx;
    if (latin1[dataEnd - 1] === "\n") dataEnd--;
    if (latin1[dataEnd - 1] === "\r") dataEnd--;
    streamDictRe.lastIndex = endIdx + "endstream".length;

    let text: string | undefined;
    if (/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode)/.test(dict)) {
      try {
        text = inflateSync(buf.subarray(dataStart, dataEnd)).toString("latin1");
      } catch {
        continue;
      }
    } else if (!/\/Filter/.test(dict)) {
      text = latin1.slice(dataStart, dataEnd);
    }
    if (!text) continue;
    if (/beginbfchar|beginbfrange/.test(text)) cmapChunks.push(text);
    else if (/\bBT\b[\s\S]*\bET\b/.test(text)) contentChunks.push(text);
  }

  const cmap = new Map<number, string>();
  for (const chunk of cmapChunks) for (const [code, str] of parseToUnicodeCMap(chunk)) cmap.set(code, str);

  const pages = contentChunks.map((c) => extractShowTextOps(c, cmap));
  const text = pages
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, hasTextLayer: text.length > 0 };
}
