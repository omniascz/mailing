# Verifying webhook signatures

MailForge signs every outbound webhook so your endpoint can prove the
payload came from us and hasn't been tampered with or replayed.

## Headers we send

| Header                    | Format               | Required                                                                                        |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `X-ForgeMsg-Signature`    | `sha256=<hex>`       | Yes — legacy; HMAC over the raw body.                                                           |
| `X-ForgeMsg-Signature-V2` | `t=<epoch>,v1=<hex>` | Yes — Stripe-style. HMAC over `<timestamp>.<body>`, so replays past your tolerance window fail. |
| `X-ForgeMsg-Timestamp`    | Unix seconds         | Yes — exposed plain so you can age-check without parsing v2.                                    |
| `X-ForgeMsg-Event`        | string               | Yes — e.g. `email.delivered`.                                                                   |
| `X-ForgeMsg-Delivery`     | UUID                 | Yes — idempotency key for retries.                                                              |

**Prefer V2.** It binds the timestamp into the HMAC so an attacker who
captures a valid signature can't replay it 30 days later. The legacy
header is kept for older integrations; new code should validate V2.

## Verification snippets

### Node.js

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyMailforge(
  secret: string,
  body: string, // raw request body, exactly as received
  signatureV2: string, // X-ForgeMsg-Signature-V2 header
  toleranceSec = 300,
): boolean {
  const tMatch = signatureV2.match(/t=(\d+)/);
  const vMatch = signatureV2.match(/v1=([0-9a-f]+)/);
  if (!tMatch || !vMatch) return false;

  const timestamp = Number(tMatch[1]);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  // timingSafeEqual requires equal-length buffers
  if (expected.length !== vMatch[1]!.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(vMatch[1]!));
}
```

### Python

```python
import hmac, hashlib, time, re

def verify_mailforge(secret: str, body: bytes, signature_v2: str, tolerance_sec: int = 300) -> bool:
    t_match = re.search(r"t=(\d+)", signature_v2)
    v_match = re.search(r"v1=([0-9a-f]+)", signature_v2)
    if not t_match or not v_match:
        return False

    timestamp = int(t_match.group(1))
    if abs(time.time() - timestamp) > tolerance_sec:
        return False

    signed_payload = f"{timestamp}.".encode() + body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v_match.group(1))
```

### Ruby (Sinatra / Rails)

```ruby
require 'openssl'

def verify_mailforge(secret, body, signature_v2, tolerance_sec = 300)
  return false unless signature_v2 =~ /t=(\d+),v1=([0-9a-f]+)/

  timestamp = Regexp.last_match(1).to_i
  signature = Regexp.last_match(2)
  return false if (Time.now.to_i - timestamp).abs > tolerance_sec

  signed_payload = "#{timestamp}.#{body}"
  expected = OpenSSL::HMAC.hexdigest('SHA256', secret, signed_payload)
  Rack::Utils.secure_compare(expected, signature)
end
```

## Rotating your secret

`PATCH /api/v1/webhooks/:id` returns a new secret value. We immediately
start signing with it for new deliveries. **Existing in-flight
deliveries in the retry queue will still use the previous secret** — if
you reject those for a few minutes after rotation, that's expected.
After your rolling deploys stabilize, all retries pick up the new
secret automatically.

## Replay protection

The `t=…` timestamp in V2 binds the payload to a moment. We use a
**5-minute** default tolerance window; pick whatever your business risk
tolerates (300 seconds is Stripe's default and works well for most).

A captured signature won't replay successfully because the receiving
side compares the wire timestamp to its current clock. Out-of-window
deliveries fail signature verification with `false`.

## Idempotency

`X-ForgeMsg-Delivery` is unique per delivery attempt and stable across
retries. Use it as a dedup key in your handler so a retried delivery
doesn't create duplicate records.
