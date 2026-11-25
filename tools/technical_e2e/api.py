"""Small HTTP client for the technical E2E (Host :5090, Recorder :5095, AI :8090). Dev bench only.

Credentials: WARO_E2E_USER / WARO_E2E_PASSWORD (default: the dev seed admin). Nothing is written to disk.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

HOST = os.environ.get("WARO_E2E_HOST_URL", "http://127.0.0.1:5090")
RECORDER = os.environ.get("WARO_E2E_RECORDER_URL", "http://127.0.0.1:5095")
AI = os.environ.get("WARO_E2E_AI_URL", "http://127.0.0.1:8090")


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str, url: str) -> None:
        super().__init__(f"{status} {url}: {body[:400]}")
        self.status, self.body = status, body


class Api:
    def __init__(self, user: str | None = None, password: str | None = None) -> None:
        self.user = user or os.environ.get("WARO_E2E_USER", "admin")
        self._password = password or os.environ.get("WARO_E2E_PASSWORD", "Admin@123")
        self._token: str | None = None
        self._token_at = 0.0

    @property
    def token(self) -> str:
        if self._token is None or time.monotonic() - self._token_at > 600:
            body = self._call("POST", f"{HOST}/api/identity/login",
                              {"username": self.user, "password": self._password}, auth=False)
            self._token, self._token_at = body["accessToken"], time.monotonic()
        return self._token

    def _call(self, method: str, url: str, body: Any = None, auth: bool = True, timeout: float = 60) -> Any:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if auth:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode()
        except urllib.error.HTTPError as e:
            raise ApiError(e.code, e.read().decode(errors="replace"), url) from None
        return json.loads(text) if text else None

    def host(self, method: str, path: str, body: Any = None, timeout: float = 60) -> Any:
        return self._call(method, f"{HOST}{path}", body, timeout=timeout)

    def recorder(self, method: str, path: str, body: Any = None) -> Any:
        return self._call(method, f"{RECORDER}/api/evidence{path}", body)

    def ai(self, method: str, path: str, body: Any = None, timeout: float = 300) -> Any:
        return self._call(method, f"{AI}/v1{path}", body, timeout=timeout)
