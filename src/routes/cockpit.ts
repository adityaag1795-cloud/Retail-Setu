import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody } from "../httpUtil.js";
import { cockpitSnapshot } from "../services/cockpit.js";
import { syncPredictiveAlerts } from "../services/predictive.js";
import { fetchCrudeRate, fetchEnergyNews } from "../services/energyBriefing.js";
import { store, nextId } from "../store.js";

export function registerCockpitRoutes(router: Router) {
  router.get("/api/cockpit", (_req, res) => {
    // Whichever module the SO opens first should reflect predictive signals — not only Module 3.
    syncPredictiveAlerts();
    sendJson(res, 200, cockpitSnapshot());
  });

  // Live crude rate + energy news, re-fetched on every call (no caching) so a page refresh always
  // tries for the real current figure. Falls back to the SO's own manual entry for today if the
  // live fetch fails — never a fabricated number/headline in either path.
  router.get("/api/cockpit/energy-briefing", async (_req, res) => {
    const [crude, news] = await Promise.all([fetchCrudeRate(), fetchEnergyNews()]);
    const today = new Date().toISOString().slice(0, 10);
    const manualToday = [...store.energyManualEntries].reverse().find((e) => e.date === today);
    sendJson(res, 200, { crude, news, manualToday: manualToday ?? null, fetchedAt: new Date().toISOString() });
  });

  router.post("/api/cockpit/energy-briefing", async (req, res) => {
    const body = await readJsonBody<{ crudeRateUsdPerBbl?: number; notes: string }>(req);
    const entry = {
      id: nextId("ENERGY"),
      date: new Date().toISOString().slice(0, 10),
      crudeRateUsdPerBbl: body.crudeRateUsdPerBbl,
      notes: body.notes ?? "",
      postedAt: new Date().toISOString(),
    };
    store.energyManualEntries.push(entry);
    sendJson(res, 200, entry);
  });
}
