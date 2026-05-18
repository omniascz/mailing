from __future__ import annotations

from typing import Any, Dict, Generator, Iterator, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..client import ForgemsgClient


class ContactsResource:
    def __init__(self, client: "ForgemsgClient") -> None:
        self._client = client

    def list(
        self,
        cursor: Optional[str] = None,
        limit: int = 50,
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if search:
            params["search"] = search
        return self._client.get("/api/v1/contacts", params=params)

    def get(self, contact_id: str) -> Dict[str, Any]:
        return self._client.get(f"/api/v1/contacts/{contact_id}")

    def create(
        self,
        email: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        phone: Optional[str] = None,
        custom_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {}
        if email:
            body["email"] = email
        if first_name:
            body["firstName"] = first_name
        if last_name:
            body["lastName"] = last_name
        if phone:
            body["phone"] = phone
        if custom_fields:
            body["customFields"] = custom_fields
        return self._client.post("/api/v1/contacts", json=body)

    def update(self, contact_id: str, **kwargs: Any) -> Dict[str, Any]:
        # Map snake_case → camelCase
        mapping = {
            "first_name": "firstName",
            "last_name": "lastName",
            "custom_fields": "customFields",
        }
        body = {mapping.get(k, k): v for k, v in kwargs.items()}
        return self._client.put(f"/api/v1/contacts/{contact_id}", json=body)

    def delete(self, contact_id: str) -> None:
        self._client.delete(f"/api/v1/contacts/{contact_id}")

    def bulk_create(self, contacts: List[Dict[str, Any]]) -> Dict[str, Any]:
        return self._client.post("/api/v1/contacts/bulk", json={"contacts": contacts})

    def add_tag(self, contact_id: str, tag_name: str) -> None:
        self._client.post(f"/api/v1/contacts/{contact_id}/tags", json={"tagName": tag_name})

    def remove_tag(self, contact_id: str, tag_name: str) -> None:
        from urllib.parse import quote
        self._client.delete(f"/api/v1/contacts/{contact_id}/tags/{quote(tag_name)}")

    def all(self, page_size: int = 100) -> Generator[List[Dict[str, Any]], None, None]:
        """Iterate all contacts across pages."""
        yield from self._client.paginate("/api/v1/contacts", page_size=page_size)
