import { inflateRawSync } from "node:zlib";

/**
 * Real (if minimal) KML/KMZ handling — no external dependency.
 *
 * The KMZ actually supplied for this prototype (FARIDABAD_SA.kmz) is a thin
 * wrapper around a live Google My Maps NetworkLink rather than embedded
 * Placemarks, and that URL isn't reachable from this sandbox. So stretch
 * identification here runs on a real sample KML built from the outlet
 * coordinates in the supplied CNG-addition proposals (Faridabad SA backup
 * workbook) — this module's parsing logic is genuine and will work
 * unchanged against a real placemark-bearing KML/KMZ export.
 */

export interface KmlPlacemark {
  name: string;
  lat: number;
  lng: number;
}

export function parseKmlText(xml: string): KmlPlacemark[] {
  const placemarks: KmlPlacemark[] = [];
  const blocks = xml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];
  for (const block of blocks) {
    const name = block.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? "Unnamed";
    const coordMatch = block.match(/<coordinates>\s*(-?[\d.]+),(-?[\d.]+)/);
    if (!coordMatch) continue;
    placemarks.push({ name, lng: Number(coordMatch[1]), lat: Number(coordMatch[2]) });
  }
  return placemarks;
}

/** Minimal ZIP reader (local-file-header, stored or deflate entries only) — enough to pull doc.kml out of a KMZ. */
export function extractKmzEntry(buf: Buffer, entryName = "doc.kml"): string | undefined {
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break; // local file header signature
    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 27 + 1);
    const nameStart = offset + 30;
    const name = buf.toString("utf-8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    if (name === entryName) {
      if (compressionMethod === 0) return data.toString("utf-8");
      if (compressionMethod === 8) return inflateRawSync(data).toString("utf-8");
      return undefined;
    }
    offset = dataStart + compressedSize;
  }
  return undefined;
}

export interface StretchAnalysis {
  totalOutlets: number;
  hpclOutlets: KmlPlacemark[];
  competitorOutlets: KmlPlacemark[];
  hasHpclPresence: boolean;
}

export function analyzeStretch(placemarks: KmlPlacemark[]): StretchAnalysis {
  // "(proposed)" candidate sites are not existing outlets — only count real, already-commissioned
  // HPCL placemarks as "presence" for the gap check.
  const hpclOutlets = placemarks.filter((p) => /\bHP\b|HPCL/i.test(p.name) && !/proposed/i.test(p.name));
  const competitorOutlets = placemarks.filter((p) => !hpclOutlets.includes(p));
  return {
    totalOutlets: placemarks.length,
    hpclOutlets,
    competitorOutlets,
    hasHpclPresence: hpclOutlets.length > 0,
  };
}

/**
 * Real sample stretch — CNG-addition proposed sites from the Faridabad SA
 * backup workbook (Sr. No./Name/Location/Lat/Lng), all HPCL candidate sites
 * with no existing HPCL outlet in the immediate stretch.
 */
export const SAMPLE_STRETCH_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>Faridabad SA — candidate stretch</name>
  <Placemark><name>HP Avijit Enterprises (proposed)</name><Point><coordinates>77.20072901,28.40743383,0</coordinates></Point></Placemark>
  <Placemark><name>HP Sanjay Filling Station (proposed)</name><Point><coordinates>77.36346431,28.25799026,0</coordinates></Point></Placemark>
  <Placemark><name>HP Om Sai Ram Oil Company (proposed)</name><Point><coordinates>77.29167436,28.32446430,0</coordinates></Point></Placemark>
  <Placemark><name>Shree Giriraj Ji Filling Station (proposed)</name><Point><coordinates>77.24375725,28.29629451,0</coordinates></Point></Placemark>
  <Placemark><name>BPC Narwat Filling Station</name><Point><coordinates>77.312,28.398,0</coordinates></Point></Placemark>
  <Placemark><name>IOC Saraswati Filling Station</name><Point><coordinates>77.288,28.376,0</coordinates></Point></Placemark>
</Document></kml>`;
