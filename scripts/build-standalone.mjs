#!/usr/bin/env node
/**
 * Bundles the compiled server (dist/**\/*.js) and client (public/{app,api,dom}.js) into ONE
 * self-contained HTML file that runs with no Node process and no network — for sharing/demoing
 * the prototype by just opening a file.
 *
 * How: tsc emits real ESM (NodeNext), so every module here uses a small, consistent set of
 * patterns (`import { a, b as c } from "./x.js"`, `import * as ns from "./x.js"`, a single default
 * import of "node:path", and `export function|class|const|let`). This script rewrites those
 * patterns into a tiny hand-rolled CommonJS-style module system (`MODULES[id] = (module, exports,
 * __require) => {...}`), resolving every relative import to its final module id at BUILD time (in
 * Node, where path resolution is unambiguous) rather than relying on browser import maps.
 *
 * The server's real route handlers (Router, all registerXRoutes, every service) run in the page
 * exactly as they do under Node — a `window.fetch` override intercepts calls to "/api/..." and
 * feeds them straight into the real Router.match()+handler, using a minimal fake
 * IncomingMessage/ServerResponse. A document-level click interceptor does the same for the
 * `<a href="/api/....pdf" target="_blank">` download links, converting the handler's Buffer output
 * into a Blob opened in a new tab (those links doesn't go through fetch(), so they need their own
 * hook). A ~40-line Buffer shim (extends Uint8Array) covers the handful of Buffer methods actually
 * used. Node's fs/path/url are stubbed (no disk in a browser — persisted-override loading is
 * skipped, so the demo always starts from the fresh seed data). Node's zlib (real .xlsx/.docx/
 * compressed-PDF parsing) is stubbed to throw a clear, honest "not available in this standalone
 * demo" error instead of silently failing — this is the one real feature gap, confined to file
 * *uploads*; everything already in the seeded 70-outlet dataset (all 7 modules' analytics,
 * workflows, PDF *generation*, Knowledge Centre) works exactly as it does on the real server.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(ROOT, "retail-setu-standalone.html");

// ---------------------------------------------------------------------------
// 1. Collect source files
// ---------------------------------------------------------------------------

function walkJs(dir, base, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkJs(full, base, out);
    } else if (entry.endsWith(".js") && full !== path.join(DIST, "server.js")) {
      const id = path.posix.relative(base.split(path.sep).join("/"), full.split(path.sep).join("/"));
      out.push({ id, absPath: full });
    }
  }
}

const serverFiles = [];
walkJs(DIST, DIST, serverFiles);

const clientFiles = ["app.js", "api.js", "dom.js"].map((f) => ({
  id: `client/${f}`,
  absPath: path.join(PUBLIC, f),
}));

// ---------------------------------------------------------------------------
// 2. Resolve a relative import specifier to a final module id
// ---------------------------------------------------------------------------

function resolveId(currentId, spec) {
  if (spec.startsWith("node:")) return spec;
  if (spec.startsWith(".")) {
    const dir = path.posix.dirname(currentId);
    return path.posix.normalize(path.posix.join(dir, spec));
  }
  throw new Error(`Cannot resolve bare specifier "${spec}" imported from ${currentId}`);
}

// ---------------------------------------------------------------------------
// 3. ESM -> tiny CJS-style transform (see file header for why this is safe)
// ---------------------------------------------------------------------------

function transformModule(id, source) {
  const exportedNames = new Set();
  let code = source;

  code = code.replace(/^\/\/#\s*sourceMappingURL=.*$/gm, "");
  code = code.replace(/import\.meta\.url/g, '"file:///virtual/"');

  // Named imports: import { a, b as c } from "spec";
  code = code.replace(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/g, (_m, names, spec) => {
    const resolved = resolveId(id, spec);
    const destructure = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const m = n.match(/^(\w+)\s+as\s+(\w+)$/);
        return m ? `${m[1]}: ${m[2]}` : n;
      })
      .join(", ");
    return `const { ${destructure} } = __require(${JSON.stringify(resolved)});`;
  });

  // Namespace imports: import * as ns from "spec";
  code = code.replace(/import\s*\*\s*as\s+(\w+)\s*from\s*["']([^"']+)["'];?/g, (_m, ns, spec) => {
    const resolved = resolveId(id, spec);
    return `const ${ns} = __require(${JSON.stringify(resolved)});`;
  });

  // Default imports: import X from "spec"; (only "node:path" in this codebase)
  code = code.replace(/import\s+(\w+)\s*from\s*["']([^"']+)["'];?/g, (_m, name, spec) => {
    const resolved = resolveId(id, spec);
    return `const ${name} = __require(${JSON.stringify(resolved)}).default;`;
  });

  // export function/async function/class Name
  code = code.replace(/^export (async function|function|class)\s+(\w+)/gm, (_m, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });

  // export const/let/var Name
  code = code.replace(/^export (const|let|var)\s+(\w+)/gm, (_m, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });

  const exportLines = [...exportedNames].map((n) => `exports.${n} = ${n};`).join("\n");
  return `${code}\n${exportLines}\n`;
}

// ---------------------------------------------------------------------------
// 4. Node built-in shims (the browser has no fs/path/url/zlib)
// ---------------------------------------------------------------------------

const NODE_SHIMS = `
MODULES["node:path"] = function (module, exports) {
  function posixJoin() { return Array.prototype.slice.call(arguments).filter(Boolean).join("/").replace(/\\/+/g, "/"); }
  function dirname(p) { var i = p.lastIndexOf("/"); return i === -1 ? "." : (p.slice(0, i) || "/"); }
  function extname(p) { var i = p.lastIndexOf("."); return i === -1 ? "" : p.slice(i); }
  var path = { join: posixJoin, dirname: dirname, normalize: function (p) { return p; }, extname: extname, resolve: posixJoin };
  exports.default = path;
  Object.assign(exports, path);
};
MODULES["node:fs"] = function (module, exports) {
  // No disk in the browser: persisted-override loading is skipped, so the demo always starts
  // from the fresh seed data (see services/dataUpload.js's applyPersistedOverridesOnStartup,
  // which the standalone bootstrap deliberately never calls).
  exports.existsSync = function () { return false; };
  exports.mkdirSync = function () {};
  exports.readFileSync = function () { throw new Error("No persisted data in the standalone demo."); };
  exports.writeFileSync = function () {};
};
MODULES["node:url"] = function (module, exports) {
  exports.fileURLToPath = function () { return "/virtual/"; };
};
MODULES["node:zlib"] = function (module, exports) {
  function notAvailable() {
    throw new Error(
      "This standalone demo has no zlib, so it can't decompress a real .xlsx/.docx/scanned-PDF upload. " +
      "Everything already in the seeded dataset (all 7 modules, analytics, PDF generation, Knowledge Centre) " +
      "works fully offline — only NEW file uploads need the real Node server."
    );
  }
  exports.inflateRawSync = notAvailable;
  exports.inflateSync = notAvailable;
};
`;

// ---------------------------------------------------------------------------
// 5. Runtime harness: module registry, Buffer shim, fake req/res, fetch + click hooks
// ---------------------------------------------------------------------------

const HARNESS = `
var MODULES = {};
var CACHE = {};
function __require(id) {
  if (CACHE[id]) return CACHE[id].exports;
  var mod = { exports: {} };
  CACHE[id] = mod; // set before running the factory so circular requires get the (partial) live object
  var factory = MODULES[id];
  if (!factory) throw new Error("Module not found: " + id);
  factory(mod, mod.exports, __require);
  return mod.exports;
}

class BufferShim extends Uint8Array {
  toString(encoding) {
    encoding = encoding || "utf-8";
    if (encoding === "latin1" || encoding === "binary") {
      var s = "";
      for (var i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
      return s;
    }
    if (encoding === "base64") {
      var s2 = "";
      for (var j = 0; j < this.length; j++) s2 += String.fromCharCode(this[j]);
      return btoa(s2);
    }
    return new TextDecoder("utf-8").decode(this);
  }
  static from(input, encoding) {
    if (typeof input === "string") {
      if (encoding === "base64") {
        var bin = atob(input);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new BufferShim(arr.buffer);
      }
      if (encoding === "latin1" || encoding === "binary") {
        var arr2 = new Uint8Array(input.length);
        for (var j = 0; j < input.length; j++) arr2[j] = input.charCodeAt(j) & 0xff;
        return new BufferShim(arr2.buffer);
      }
      var bytes = new TextEncoder().encode(input);
      return new BufferShim(bytes.buffer);
    }
    return new BufferShim(new Uint8Array(input).buffer);
  }
  static alloc(n) { return new BufferShim(n); }
  static concat(list) {
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].length;
    var out = new BufferShim(total);
    var offset = 0;
    for (var j = 0; j < list.length; j++) { out.set(list[j], offset); offset += list[j].length; }
    return out;
  }
  static byteLength(str) { return new TextEncoder().encode(str).length; }
}
globalThis.Buffer = BufferShim;
globalThis.process = globalThis.process || { env: {} }; // no ANTHROPIC_API_KEY in a browser -> always the offline template engine

function __makeFakeReq(method) {
  var listeners = {};
  return {
    method: method,
    headers: {},
    on: function (event, cb) { (listeners[event] = listeners[event] || []).push(cb); return this; },
    __emit: function (event) {
      var args = Array.prototype.slice.call(arguments, 1);
      (listeners[event] || []).forEach(function (cb) { cb.apply(null, args); });
    },
  };
}
function __makeFakeRes() {
  return {
    _status: 200,
    _headers: {},
    _body: undefined,
    writeHead: function (status, headers) { this._status = status; this._headers = headers || {}; },
    setHeader: function (k, v) { this._headers[k] = v; },
    end: function (data) { this._body = data; },
  };
}

async function __dispatch(router, method, pathname, bodyBytes) {
  var match = router.match(method, pathname);
  if (!match) return { status: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "No route for " + method + " " + pathname }) };
  var req = __makeFakeReq(method);
  var res = __makeFakeRes();
  try {
    var handlerPromise = match.handler(req, res, match.params);
    queueMicrotask(function () {
      if (bodyBytes && bodyBytes.length) req.__emit("data", BufferShim.from(bodyBytes));
      req.__emit("end");
    });
    await handlerPromise;
  } catch (err) {
    if (err && typeof err.status === "number") {
      return { status: err.status, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) };
    }
    console.error(err);
    return { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: (err && err.message) || "Internal error" }) };
  }
  return { status: res._status, headers: res._headers, body: res._body };
}

function __installBrowserHooks(router) {
  var REAL_FETCH = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : input.url;
    var pathname = url;
    try { pathname = new URL(url, "http://__local__/").pathname; } catch (e) {}
    if (pathname.indexOf("/api/") === 0) {
      var method = (init && init.method) || "GET";
      var bodyBytes;
      if (init && init.body) bodyBytes = typeof init.body === "string" ? new TextEncoder().encode(init.body) : init.body;
      var result = await __dispatch(router, method, pathname, bodyBytes);
      return new Response(result.body, { status: result.status, headers: result.headers });
    }
    return REAL_FETCH(input, init);
  };

  document.addEventListener("click", async function (e) {
    var a = e.target.closest ? e.target.closest("a[href^='/api/']") : null;
    if (!a) return;
    e.preventDefault();
    var href = a.getAttribute("href").split("?")[0];
    var result = await __dispatch(router, "GET", href, undefined);
    if (result.status >= 400) {
      var msg = "Request failed";
      try { msg = JSON.parse(result.body).error || msg; } catch (e2) {}
      alert(msg);
      return;
    }
    var bytes = typeof result.body === "string" ? new TextEncoder().encode(result.body) : result.body;
    var contentType = result.headers["content-type"] || result.headers["Content-Type"] || "application/octet-stream";
    var blob = new Blob([bytes], { type: contentType });
    window.open(URL.createObjectURL(blob), "_blank");
  }, true);
}
`;

// ---------------------------------------------------------------------------
// 6. Build all module bodies
// ---------------------------------------------------------------------------

let moduleSource = "";
for (const { id, absPath } of [...serverFiles, ...clientFiles]) {
  const raw = readFileSync(absPath, "utf-8");
  const transformed = transformModule(id, raw);
  moduleSource += `MODULES[${JSON.stringify(id)}] = function (module, exports, __require) {\n${transformed}\n};\n`;
}

const BOOTSTRAP = `
var { Router } = __require("httpUtil.js");
var { registerOutletRoutes } = __require("routes/outlets.js");
var { registerDealerCaseRoutes } = __require("routes/dealerCases.js");
var { registerAnalyticsRoutes } = __require("routes/analytics.js");
var { registerTeamRoutes } = __require("routes/teams.js");
var { registerCockpitRoutes } = __require("routes/cockpit.js");
var { registerKnowledgeRoutes } = __require("routes/knowledge.js");
var { registerKmlRoutes } = __require("routes/kml.js");
var { registerDealerDeskRoutes } = __require("routes/dealerDesk.js");
var { registerDataUploadRoutes } = __require("routes/dataUpload.js");
var { registerTradingAreaRoutes } = __require("routes/tradingAreas.js");
var { sendJson } = __require("httpUtil.js");
var { getAiEngine } = __require("services/aiEngine.js");

var router = new Router();
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
router.get("/api/health", function (_req, res) {
  sendJson(res, 200, { status: "ok", aiEngine: getAiEngine().name + " [standalone offline demo]", time: new Date().toISOString() });
});

__installBrowserHooks(router);
__require("client/app.js");
`;

// ---------------------------------------------------------------------------
// 7. Assemble the HTML shell
// ---------------------------------------------------------------------------

const css = readFileSync(path.join(PUBLIC, "styles.css"), "utf-8");
const indexHtml = readFileSync(path.join(PUBLIC, "index.html"), "utf-8");
const bodyMatch = indexHtml.match(/<body>([\s\S]*)<\/body>/);
const bodyInner = bodyMatch[1].replace(/<script[\s\S]*?<\/script>\s*$/, "").trim();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Retail Setu — Standalone Demo</title>
<style>
${css}
.standalone-banner { background: #fff3cd; border-bottom: 1px solid #e0c36a; padding: 0.6rem 1rem; font-size: 0.85rem; color: #5a4a12; }
.standalone-banner button { float: right; border: none; background: none; cursor: pointer; font-weight: bold; }
</style>
</head>
<body>
<div class="standalone-banner" id="standalone-banner">
  <button onclick="document.getElementById('standalone-banner').remove()">✕</button>
  <strong>Standalone offline demo</strong> — runs entirely in this browser tab, no server. All 7 modules,
  the real seeded 70-outlet dataset, analytics and PDF generation work exactly as on the live server.
  Two things don't: live external news/crude-rate fetches (network-blocked, shown as "unavailable" like
  always), and NEW file uploads (.xlsx/.docx/.pdf parsing needs zlib, not available in a browser — shown
  as an explicit error, not a silent failure). State resets whenever you reload this file.
</div>
${bodyInner}
<script>
${HARNESS}
${NODE_SHIMS}
${moduleSource}
${BOOTSTRAP}
</script>
</body>
</html>
`;

writeFileSync(OUT, html, "utf-8");
console.log(`Wrote ${OUT} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
