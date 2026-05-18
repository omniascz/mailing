"""
Webhook signature verification helper.

Usage::

    from forgemsg import verify_webhook_signature

    ok = verify_webhook_signature(
        secret=os.environ["FORGEMSG_WEBHOOK_SECRET"],
        payload=request.get_data(as_text=True),
        signature=request.headers.get("X-ForgeMsg-Signature", ""),
    )
    if not ok:
        abort(401)
"""

import hashlib
import hmac


def verify_webhook_signature(secret: str, payload: str, signature: str) -> bool:
    """
    Returns True if *signature* matches HMAC-SHA256(*secret*, *payload*).

    Uses :func:`hmac.compare_digest` for constant-time comparison.
    """
    expected = "sha256=" + hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
