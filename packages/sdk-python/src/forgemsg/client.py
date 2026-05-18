"""
ForgeMsg HTTP client — requests-based with auto-retry and rate-limit handling.
"""

from __future__ import annotations

import time
from typing import Any, Dict, Generator, Iterator, List, Optional

import requests
from requests import Response, Session

from .resources.contacts import ContactsResource
from .resources.events import EventsResource


DEFAULT_BASE_URL = "https://api.forgemsg.io"
DEFAULT_MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30


class ForgemsgError(Exception):
    """Raised when the API returns a non-2xx response."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message

    def __repr__(self) -> str:
        return f"ForgemsgError(status={self.status_code}, code={self.code!r}, message={self.message!r})"


class ForgemsgClient:
    """
    Main client for the ForgeMsg API.

    :param api_key:     Your API key (``X-API-Key`` header).
    :param base_url:    Override the API base URL (useful for self-hosted instances).
    :param max_retries: Number of automatic retries on 429/5xx. Default: 3.
    :param timeout:     Request timeout in seconds. Default: 30.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")

        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._max_retries = max_retries
        self._timeout = timeout

        self._session = Session()
        self._session.headers.update(
            {
                "X-API-Key": api_key,
                "Content-Type": "application/json",
                "User-Agent": "forgemsg-python/0.1.0",
            }
        )

        # Resource namespaces
        self.contacts = ContactsResource(self)
        self.events = EventsResource(self)

    # ─── HTTP helpers ──────────────────────────────────────────────────────────

    def request(
        self,
        method: str,
        path: str,
        json: Optional[Any] = None,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 0,
    ) -> Any:
        url = f"{self._base_url}{path}"
        resp: Response = self._session.request(
            method,
            url,
            json=json,
            params=params,
            timeout=self._timeout,
        )

        # Retry on 429 / 5xx
        if resp.status_code in (429, 500, 502, 503, 504) and retries < self._max_retries:
            delay = min(0.2 * (2 ** retries), 5.0)
            time.sleep(delay)
            return self.request(method, path, json=json, params=params, retries=retries + 1)

        if not resp.ok:
            try:
                body = resp.json()
            except Exception:
                body = {}
            raise ForgemsgError(
                status_code=resp.status_code,
                code=str(body.get("code", "API_ERROR")),
                message=str(body.get("message", f"HTTP {resp.status_code}")),
            )

        if resp.status_code == 204:
            return None

        return resp.json()

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, json: Optional[Any] = None) -> Any:
        return self.request("POST", path, json=json)

    def put(self, path: str, json: Optional[Any] = None) -> Any:
        return self.request("PUT", path, json=json)

    def delete(self, path: str) -> None:
        self.request("DELETE", path)

    # ─── Pagination helper ─────────────────────────────────────────────────────

    def paginate(self, path: str, page_size: int = 100) -> Generator[List[Any], None, None]:
        """
        Yields successive pages from a list endpoint.

        Example::

            for page in client.paginate("/api/v1/contacts"):
                for contact in page:
                    process(contact)
        """
        cursor = None
        while True:
            params: Dict[str, Any] = {"limit": page_size}
            if cursor:
                params["cursor"] = cursor

            result = self.get(path, params=params)
            yield result.get("data", [])

            if not result.get("hasMore") or not result.get("cursor"):
                break
            cursor = result["cursor"]
