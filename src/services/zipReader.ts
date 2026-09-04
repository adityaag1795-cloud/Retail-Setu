import { inflateRawSync } from "node:zlib";

/**
 * Minimal zero-dependency ZIP reader — a .xlsx/.docx/.kmz are all just a ZIP of XML parts.
 * Reads local-file-header entries (stored or deflated); shared by xlsxReader.ts and docxReader.ts.
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export function readZipEntries(buf: Buffer): ZipEntry[] {
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
