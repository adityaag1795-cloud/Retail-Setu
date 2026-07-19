import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody } from "../httpUtil.js";
import { parseKmlText, analyzeStretch, SAMPLE_STRETCH_KML } from "../services/kml.js";

export function registerKmlRoutes(router: Router) {
  // Module 2, Step 1 — identify stretches with no HPCL presence from a KML export.
  // Paste real KML <Placemark> text, or omit kmlText to see it run against the real
  // sample stretch (CNG-addition proposed sites from the Faridabad SA backup workbook).
  router.post("/api/kml/analyze", async (req, res) => {
    const body = await readJsonBody<{ kmlText?: string }>(req);
    const kmlText = body.kmlText?.trim() || SAMPLE_STRETCH_KML;
    const placemarks = parseKmlText(kmlText);
    const analysis = analyzeStretch(placemarks);
    sendJson(res, 200, { placemarks, ...analysis });
  });

  router.get("/api/kml/sample", (_req, res) => {
    sendJson(res, 200, { kmlText: SAMPLE_STRETCH_KML });
  });
}
