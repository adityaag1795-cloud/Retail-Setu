import type { Router } from "../httpUtil.js";
import { sendJson } from "../httpUtil.js";
import { cockpitSnapshot } from "../services/cockpit.js";
import { syncPredictiveAlerts } from "../services/predictive.js";

export function registerCockpitRoutes(router: Router) {
  router.get("/api/cockpit", (_req, res) => {
    // Whichever module the SO opens first should reflect predictive signals — not only Module 3.
    syncPredictiveAlerts();
    sendJson(res, 200, cockpitSnapshot());
  });
}
