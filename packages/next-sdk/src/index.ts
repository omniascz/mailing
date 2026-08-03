/**
 * @forgemsg/next — Next.js + Edge-runtime friendly entrypoint.
 *
 * Two-line setup that mirrors Resend's DX:
 *
 * ```ts
 * // app/api/send/route.ts
 * import { mailforge } from '@forgemsg/next';
 *
 * export async function POST() {
 *   await mailforge.emails.send({
 *     from: 'noreply@your.com',
 *     to: 'jane@example.com',
 *     subject: 'Hello',
 *     html: '<p>Hi.</p>',
 *   });
 *   return Response.json({ ok: true });
 * }
 * ```
 *
 * The singleton reads `FORGEMSG_API_KEY` (or `MAILFORGE_API_KEY` as an
 * alias) at first access. Custom client config — for example for
 * multi-tenant scenarios where the API key is per-request — is
 * available through `createMailforge()`.
 */

import { ForgemsgClient } from '@forgemsg/sdk';

let _singleton: ForgemsgClient | null = null;

function resolveApiKey(): string {
  const fromEnv = process.env.FORGEMSG_API_KEY ?? process.env.MAILFORGE_API_KEY ?? null;
  if (!fromEnv) {
    throw new Error(
      '[@forgemsg/next] FORGEMSG_API_KEY (or MAILFORGE_API_KEY) is not set. ' +
        'Add it to your Vercel environment variables or .env.local.',
    );
  }
  return fromEnv;
}

function resolveBaseUrl(): string | undefined {
  return process.env.FORGEMSG_API_URL ?? process.env.MAILFORGE_API_URL ?? undefined;
}

/**
 * Lazy singleton. Created on first property access so that loading
 * `@forgemsg/next` at build time doesn't require an API key.
 */
export const mailforge: ForgemsgClient = new Proxy({} as ForgemsgClient, {
  get(_target, prop) {
    if (!_singleton) {
      _singleton = new ForgemsgClient({
        apiKey: resolveApiKey(),
        baseUrl: resolveBaseUrl(),
      });
    }
    return (_singleton as unknown as Record<string, unknown>)[prop as string];
  },
});

/**
 * Explicitly construct a client. Use this when:
 *   • the API key isn't known at module-load time (multi-tenant)
 *   • you need multiple clients (staging + prod side-by-side)
 */
export function createMailforge(options: {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
  timeout?: number;
}): ForgemsgClient {
  return new ForgemsgClient(options);
}

// Re-export commonly used types so consumers don't need to import from
// two packages.
export type {
  SendEmailParams,
  SendEmailResult,
  EmailDetail,
  EmailTag,
  EmailAttachment,
  EmailRecipient,
  BatchSendResult,
  SendOptions,
  ForgemsgClientOptions,
} from '@forgemsg/sdk';

export { ForgemsgClient, ForgemsgError } from '@forgemsg/sdk';
