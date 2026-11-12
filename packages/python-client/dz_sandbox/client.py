from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Optional


class SandboxClient:
    """Minimal zero-dependency Python client for dz-sandbox Control API."""

    def __init__(self, control_url: Optional[str] = None) -> None:
        default_port = os.environ.get("DZ_CONTROL_PORT", "4000")
        raw_url = control_url or os.environ.get("DZ_CONTROL_URL") or f"http://127.0.0.1:{default_port}"
        self.control_url = raw_url.rstrip("/")

    def _request(self, method: str, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        data = None
        headers: dict[str, str] = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            f"{self.control_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def reset(self) -> dict[str, Any]:
        return self._request("POST", "/__control/reset", {})

    def scenario(self, provider: str, name: str) -> dict[str, Any]:
        encoded = urllib.parse.quote(provider, safe="")
        return self._request("PUT", f"/__control/scenario/{encoded}", {"scenario": name})

    def wait_for_webhook(
        self,
        provider: Optional[str] = None,
        event_type: Optional[str] = None,
        count: int = 1,
        timeout_ms: int = 5000,
        poll_interval_ms: int = 50,
    ) -> list[dict[str, Any]]:
        deadline = time.monotonic() + (timeout_ms / 1000.0)
        query = f"?provider={urllib.parse.quote(provider)}" if provider else ""

        while True:
            data = self._request("GET", f"/__control/webhooks{query}")
            hooks = list(data.get("webhooks", []))
            if event_type is not None:
                hooks = [h for h in hooks if h.get("eventType") == event_type]
            if len(hooks) >= count:
                return hooks
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"Timed out waiting for {count} webhook(s) after {timeout_ms}ms (found {len(hooks)})"
                )
            time.sleep(poll_interval_ms / 1000.0)

    def clock_advance(self, duration: str | int) -> dict[str, Any]:
        return self._request("POST", "/__control/clock/advance", {"duration": duration})

    def state(self) -> dict[str, Any]:
        return self._request("GET", "/__control/state")


sandbox = SandboxClient()
