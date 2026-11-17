/**
 * The development server the smokes and the player use.
 *
 * `python3 -m http.server` sends no `Cache-Control`, so a browser keeps serving the old
 * `src/i18n/*.js` after a change and the screen shows raw keys instead of labels. This
 * one says no-store on every response, which is what a development server should say.
 *
 *   node scripts/serve.mjs [port]     (default 8765)
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.argv[2]) || 8765;

const TYPES = {
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
};

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const path = join(root, normalize(requested).replace(/^(\.\.[/\\])+/, ""));
  if (!path.startsWith(root)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store, must-revalidate",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Cache-Control": "no-store" }).end("not found");
  }
}).listen(port, () => console.log(`barcos dev server: http://localhost:${port}/index.html (no-store)`));
