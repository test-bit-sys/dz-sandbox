import json
import pathlib
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dz_sandbox import SandboxClient


class _MockControlHandler(BaseHTTPRequestHandler):
    calls: list[tuple[str, str, object]] = []

    def do_GET(self):
        self.calls.append(("GET", self.path, None))
        if self.path.startswith("/__control/webhooks"):
            self._send(200, {"webhooks": [{"id": "wh_1", "provider": "chargily", "eventType": "checkout.paid"}]})
            return
        self._send(200, {"ok": True})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        self.calls.append(("POST", self.path, body))
        self._send(200, {"ok": True})

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        self.calls.append(("PUT", self.path, body))
        self._send(200, {"ok": True})

    def _send(self, code: int, payload: object):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format, *args):
        return


class TestPythonClient(unittest.TestCase):
    def test_reset_scenario_and_wait_for_webhook(self):
        _MockControlHandler.calls.clear()
        server = HTTPServer(("127.0.0.1", 0), _MockControlHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            port = server.server_address[1]
            client = SandboxClient(f"http://127.0.0.1:{port}")
            self.assertEqual(client.reset(), {"ok": True})
            self.assertEqual(client.scenario("chargily", "duplicate_webhook"), {"ok": True})
            hooks = client.wait_for_webhook(provider="chargily", count=1, timeout_ms=500)
            self.assertEqual(len(hooks), 1)
            self.assertEqual(client.clock_advance("2h"), {"ok": True})
            with self.assertRaises(TimeoutError):
                client.wait_for_webhook(provider="chargily", count=5, timeout_ms=100, poll_interval_ms=20)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
