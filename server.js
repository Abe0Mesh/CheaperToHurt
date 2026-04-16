import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8000);

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function safeJoin(root, requestPath) {
  const normalized = path.posix.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(root, normalized);
}

async function handleFredGraphCsv(req, res, url) {
  const id = url.searchParams.get("id");
  if (!id) {
    send(res, 400, "Missing id");
    return;
  }

  const upstream = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`;
  try {
    const upstreamRes = await fetch(upstream, {
      headers: {
        "User-Agent": "insurance-map-dev-proxy"
      }
    });
    if (!upstreamRes.ok) {
      send(res, 502, `Upstream error (${upstreamRes.status})`);
      return;
    }
    const text = await upstreamRes.text();
    send(res, 200, text, { "Content-Type": "text/csv; charset=utf-8" });
  } catch (error) {
    send(res, 502, "Upstream fetch failed");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/fredgraph.csv") {
    await handleFredGraphCsv(req, res, url);
    return;
  }

  // Static file serving
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safeJoin(__dirname, requestPath);

  if (!filePath.startsWith(__dirname)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME.get(ext) || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log("FRED proxy available at /api/fredgraph.csv?id=CPIAUCSL");
});

