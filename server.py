from __future__ import annotations

import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/fredgraph.csv":
            query = urllib.parse.parse_qs(parsed.query)
            series_id = (query.get("id") or [""])[0].strip()
            if not series_id:
                self.send_response(400)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Missing id")
                return

            upstream = (
                "https://fred.stlouisfed.org/graph/fredgraph.csv?id="
                + urllib.parse.quote(series_id)
            )
            try:
                req = urllib.request.Request(
                    upstream,
                    headers={"User-Agent": "insurance-map-dev-proxy"},
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    body = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Upstream fetch failed")
            return

        return super().do_GET()


def main() -> None:
    port = 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving on http://localhost:{port}")
    print("FRED proxy available at /api/fredgraph.csv?id=CPIAUCSL")
    server.serve_forever()


if __name__ == "__main__":
    main()

