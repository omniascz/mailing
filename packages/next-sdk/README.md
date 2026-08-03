# @forgemsg/next

Send transactional email from Next.js, Vercel Functions, or any Edge runtime in two lines.

## Install

```bash
npm install @forgemsg/next
# or
pnpm add @forgemsg/next
```

Add the API key to your environment:

```
FORGEMSG_API_KEY=fm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Send an email

```ts
// app/api/send/route.ts
import { mailforge } from '@forgemsg/next';

export async function POST() {
  const { id } = await mailforge.emails.send({
    from: 'orders@your.com',
    to: 'jane@example.com',
    subject: 'Your receipt',
    html: '<p>Thanks for your order.</p>',
  });
  return Response.json({ id });
}
```

That's it. No more boilerplate than `fetch`.

## Edge runtime

```ts
import { mailforge } from '@forgemsg/next/edge';

export const runtime = 'edge';

export async function POST(req: Request) {
  const body = await req.json();
  await mailforge.emails.send({
    from: 'noreply@your.com',
    to: body.email,
    subject: 'Welcome',
    html: `<p>Hi ${body.name}.</p>`,
  });
  return new Response('ok');
}
```

## Migrating from Resend

The shape is intentionally identical. Replace the import and the env var:

```diff
- import { Resend } from 'resend';
- const resend = new Resend(process.env.RESEND_API_KEY);
+ import { mailforge as resend } from '@forgemsg/next';

  await resend.emails.send({
    from: 'orders@your.com',
    to: 'jane@example.com',
    subject: 'Your receipt',
    html: '<p>Thanks.</p>',
  });
```

`react` prop support is provided via the `@forgemsg/react-email` adapter
— see that package's README. Tag arrays, idempotency keys, batch sends,
attachments, and the `scheduled_at` field all match Resend's surface.

## Idempotency

```ts
await mailforge.emails.send({ from, to, subject, html }, { idempotencyKey: orderId });
```

Two requests with the same `idempotencyKey` from the same API key
within 24 hours return the same response. Safe for webhook retries.

## Multi-tenant

The singleton reads `FORGEMSG_API_KEY` once. For per-tenant keys:

```ts
import { createMailforge } from '@forgemsg/next';

const client = createMailforge({ apiKey: tenant.apiKey });
await client.emails.send(/* … */);
```

## Why MailForge instead of Resend?

| Feature                     | Resend        | MailForge                      |
| --------------------------- | ------------- | ------------------------------ |
| Transactional API           | ✅            | ✅ same shape                  |
| React Email                 | ✅            | ✅ via `@forgemsg/react-email` |
| Workflows / automation      | ❌            | ✅                             |
| Multi-channel (SMS, voice)  | ❌            | ✅                             |
| EU data residency default   | ⚠️ via region | ✅                             |
| AI included (Claude)        | ❌            | ✅                             |
| CZ/SK localisation          | ❌            | ✅                             |
| Price at 50K emails / month | $20           | $19                            |
