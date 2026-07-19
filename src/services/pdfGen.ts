/**
 * Zero-dependency minimal PDF writer.
 *
 * The brief asks for communications/reports to be produced "as PDF for
 * record on click". Rather than fake it with a .txt file, this hand-writes
 * a valid single-font, single-page-per-chunk PDF (PDF 1.4, uncompressed
 * Helvetica text) with a correct xref table — no library required.
 */

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function generateSimplePdf(title: string, bodyLines: string[]): Buffer {
  const allLines = [title, "", ...bodyLines].flatMap((l) => wrapLine(l, 95));
  const linesPerPage = 55;
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  // Object numbering plan: 1=Catalog, 2=Pages, 3=Font, then per page: contentObj, pageObj
  let nextNum = 4;
  const pageContentPairs: { pageNum: number; contentNum: number }[] = [];
  for (let p = 0; p < pages.length; p++) {
    const contentNum = nextNum++;
    const pageNum = nextNum++;
    contentObjNums.push(contentNum);
    pageObjNums.push(pageNum);
    pageContentPairs.push({ pageNum, contentNum });
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  pages.forEach((lines, idx) => {
    const contentNum = contentObjNums[idx]!;
    const pageNum = pageObjNums[idx]!;
    const body =
      "BT\n/F1 11 Tf\n50 760 Td\n14 TL\n" +
      lines.map((l) => `(${escapePdfText(l)}) Tj\nT*\n`).join("") +
      "ET\n";
    objects[contentNum] = `${contentNum} 0 obj\n<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream\nendobj\n`;
    objects[pageNum] =
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`;
  });

  const totalObjects = nextNum - 1;
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let cursor = Buffer.byteLength(header);
  for (let i = 1; i <= totalObjects; i++) {
    offsets[i] = cursor;
    const objStr = objects[i] ?? `${i} 0 obj\n<< >>\nendobj\n`;
    body += objStr;
    cursor += Buffer.byteLength(objStr);
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    xref += `${offsets[i]!.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}
