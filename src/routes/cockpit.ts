import type { Router } from "../httpUtil.js";
import { sendJson } from "../httpUtil.js";
import { cockpitSnapshot } from "../services/cockpit.js";

export function registerCockpitRoutes(router: Router) {
  router.get("/api/cockpit", (_req, res) => {
    sendJson(res, 200, cockpitSnapshot());
  });
}
