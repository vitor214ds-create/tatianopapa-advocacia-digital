// Production entry for Node hosts (Railway/Docker).
//
// The Vite/Nitro build always emits a Web-standard fetch handler in
// `dist/server/index.mjs` plus static client assets in `dist/client`.
// Previous deploys pointed at `.output/server/index.mjs`, a path this build
// never produces, so the container could never boot with current code and the
// platform kept serving an older image — the UI rendered from stale HTML while
// its client bundle no longer matched, leaving every button dead.
//
// This wrapper serves `dist/client` and delegates everything else to the built
// handler, so the HTML and the JS bundle always come from the same build.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";

const root = resolve(import.meta.dirname ?? process.cwd(), "..");
const clientDir = join(root, "dist", "client");
const serverEntry = join(root, "dist", "server", "index.mjs");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const { default: handler } = await import(serverEntry);

function staticFile(pathname) {
  if (pathname.endsWith("/")) return null;
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\.]+)/, "");
  const candidate = join(clientDir, relative);
  if (!candidate.startsWith(clientDir)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

function toRequest(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers: new Headers(
      Object.entries(req.headers).flatMap(([key, value]) =>
        value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
      ),
    ),
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const file = staticFile(url.pathname);
    if (file) {
      const type = mime[extname(file)] || "application/octet-stream";
      const immutable = url.pathname.startsWith("/assets/");
      res.writeHead(200, {
        "content-type": type,
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      });
      createReadStream(file).pipe(res);
      return;
    }

    const response = await handler.fetch(toRequest(req), process.env, {
      waitUntil: (promise) => void Promise.resolve(promise).catch(() => undefined),
      passThroughOnException: () => undefined,
    });

    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
      res.end();
      return;
    }
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    const fallback = join(clientDir, "index.html");
    res.end(existsSync(fallback) ? await readFile(fallback, "utf8") : "Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`ZapFlow server listening on http://${host}:${port}`);
});
