import type { Router } from "../httpUtil.js";
import { sendJson, readJsonBody, ApiError } from "../httpUtil.js";
import { uploadSalesSnapshot, uploadStockSnapshot, DataUploadError } from "../services/dataUpload.js";

async function wrap<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DataUploadError) throw new ApiError(400, err.message);
    if (err instanceof Error) throw new ApiError(400, `Could not parse upload: ${err.message}`);
    throw err;
  }
}

export function registerDataUploadRoutes(router: Router) {
  // "Input Tap" — the SO uploads a real sales or tank-stock snapshot (.xlsx/.csv) directly,
  // instead of it needing a code change every time. See services/dataUpload.ts for the expected
  // column headers. Body carries either { text } for a pasted CSV or { base64 } for a file.
  router.post("/api/data-uploads/sales", async (req, res) => {
    const body = await readJsonBody<{ fileName: string; text?: string; base64?: string }>(req);
    if (!body.fileName || (!body.text && !body.base64)) throw new ApiError(400, "fileName and (text or base64) are required");
    sendJson(res, 200, await wrap(() => uploadSalesSnapshot(body.fileName, { text: body.text, base64: body.base64 })));
  });

  router.post("/api/data-uploads/stock", async (req, res) => {
    const body = await readJsonBody<{ fileName: string; text?: string; base64?: string }>(req);
    if (!body.fileName || (!body.text && !body.base64)) throw new ApiError(400, "fileName and (text or base64) are required");
    sendJson(res, 200, await wrap(() => uploadStockSnapshot(body.fileName, { text: body.text, base64: body.base64 })));
  });
}
