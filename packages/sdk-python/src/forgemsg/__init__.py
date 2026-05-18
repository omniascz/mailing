"""
ForgeMsg Python SDK.

Usage::

    from forgemsg import ForgemsgClient

    client = ForgemsgClient(api_key="fm_live_...")

    # Create a contact
    contact = client.contacts.create(email="jane@example.com", first_name="Jane")

    # Track an event
    client.events.track(
        contact_id=contact["id"],
        event_name="purchase",
        properties={"amount": 49.99},
    )

    # Iterate all contacts
    for page in client.contacts.all():
        print(len(page), "contacts")
"""

from .client import ForgemsgClient, ForgemsgError
from .webhook import verify_webhook_signature

__all__ = ["ForgemsgClient", "ForgemsgError", "verify_webhook_signature"]
__version__ = "0.1.0"
