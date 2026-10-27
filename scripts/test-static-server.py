#!/usr/bin/env python3
"""Local static server that models Apache's branded ErrorDocument 404 response."""
from __future__ import annotations

import argparse
import ipaddress
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def validate_loopback_bind(value: str) -> str:
    """Refuse to expose the temporary test server beyond a loopback interface."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("bind address must be a literal loopback IP") from error
    if not address.is_loopback or address.version != 4:
        raise argparse.ArgumentTypeError("temporary browser smoke server must bind to IPv4 loopback only")
    return str(address)


class RecoveryErrorDocumentHandler(SimpleHTTPRequestHandler):
    """Serve the site's real 404 document while preserving the HTTP 404 status."""

    def send_error(self, code: int, message: str | None = None,
                   explain: str | None = None) -> None:
        if code == HTTPStatus.NOT_FOUND:
            try:
                payload = (Path(self.directory) / "404.html").read_bytes()
            except OSError:
                super().send_error(code, message, explain)
                return
            self.send_response(code, message)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            return
        super().send_error(code, message, explain)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", type=validate_loopback_bind, default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()

    root = Path(args.directory).expanduser().resolve()
    if not (root / "404.html").is_file():
        parser.error("--directory must contain the site's 404.html")
    handler = partial(RecoveryErrorDocumentHandler, directory=str(root))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
