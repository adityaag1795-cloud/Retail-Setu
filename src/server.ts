import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Router, sendJson, ApiError } from "./httpUtil.js";
import { registerOutletRoutes } from "./routes/outlets.js";
import { registerDealerCaseRoutes } from "./routes/dealerCases.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerTeamRoutes } from "./routes/teams.js";
import { registerCockpitRoutes } from "./routes/cockpit.js";
import { registerKnowledgeRoutes } from "./routes/knowledge.js";
import { registerKmlRoutes } from "./routes/kml.js";
import { registerDealerDeskRoutes } from "./routes/dealerDesk.js";
import { registerDataUploadRoutes } from "./routes/dataUpload.js";
import { registerTradingAreaRoutes } from "./routes/tradingAreas.js";
import { getAiEngine } from "./services/aiEngine.js";
import { applyPersistedOverridesOnStartup } from "./services/dataUpload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env["PORT"] ?? 4300);

const router = new Router();
registerOutletRoutes(router);
registerDealerCaseRoutes(router);
registerAnalyticsRoutes(router);
registerTeamRoutes(router);
registerCockpitRoutes(router);
registerKnowledgeRoutes(router);
registerKmlRoutes(router);
registerDealerDeskRoutes(router);
registerDataUploadRoutes(router);
registerTradingAreaRoutes(router);

applyPersistedOverridesOnStartup();

router.get("/api/health", (_req, res) => {
  sendJson(res, 200, { status: "ok", aiEngine: getAiEngine().name, time: new Date().toISOString() });
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveStatic(pathname: string, res: import("node:http").ServerResponse): Promise<boolean> {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!existsSync(filePath)) return false;
  const ext = path.extname(filePath);
  const content = await readFile(filePath);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  res.end(content);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";

    if (url.pathname.startsWith("/api/")) {
      const match = router.match(method, url.pathname);
      if (!match) {
        sendJson(res, 404, { error: `No route for ${method} ${url.pathname}` });
        return;
      }
      await match.handler(req, res, match.params);
      return;
    }

    const served = await serveStatic(url.pathname, res);
    if (!served) {
      // SPA fallback for client-side routes.
      await serveStatic("/index.html", res);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    console.error(err);
    sendJson(res, 500, { error: (err as Error).message ?? "Internal error" });
  }
});

server.listen(PORT, () => {
  console.log(`Retail Ops prototype listening on http://localhost:${PORT}`);
  console.log(`AI engine: ${getAiEngine().name}`);
});
