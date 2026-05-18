from __future__ import annotations

from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..client import ForgemsgClient


class EventsResource:
    def __init__(self, client: "ForgemsgClient") -> None:
        self._client = client

    def track(
        self,
        event_name: str,
        contact_id: Optional[str] = None,
        contact_email: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"eventName": event_name}
        if contact_id:
            body["contactId"] = contact_id
        if contact_email:
            body["contactEmail"] = contact_email
        if properties:
            body["properties"] = properties
        return self._client.post("/api/v1/events", json=body)

    def list(
        self,
        contact_id: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"limit": limit}
        if contact_id:
            params["contactId"] = contact_id
        return self._client.get("/api/v1/events", params=params)
