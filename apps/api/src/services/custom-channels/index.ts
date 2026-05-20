/**
 * Custom Channels service (#347).
 *
 * Registers user-defined messaging channels and handles the outbound →
 * remote POST + inbound webhook flows.
 *
 * Message contract (JSON body sent to `outbound_url`):
 *   {
 *     orgId, channel, messageId, to: string | string[],
 *     body: string, subject?: string, metadata?: object,
 *     timestamp: ISO8601
 *   }
 *
 * Signature: `X-ForgeMsg-Signature: t=<ts>,v1=<hex hmac-sha256>`, where
 * hmac is over `${ts}.${rawBody}`. Replay window = 5 min.
 */

import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customChannels, type CustomChannel } from '../../db/schema/custom-channels.js';
import { AppError } from '../../lib/app-error.js';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export interface RegisterInput {
  slug: string;
  name: string;
  description?: string;
  outboundUrl: string;
  messageSchema?: Record<string, unknown>;
  rateLimits?: { rps?: number; maxPayloadBytes?: number };
}

export async function registerChannel(
  orgId: string,
  input: RegisterInput,
): Promise<{ channel: CustomChannel; sharedSecret: string }> {
  if (!/^https:\/\//i.test(input.outboundUrl)) {
    throw AppError.badRequest('outboundUrl must be https://');
  }
  const sharedSecret = crypto.randomBytes(32).toString('hex');

  const [row] = await db
    .insert(customChannels)
    .values({
      orgId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      outboundUrl: input.outboundUrl,
      sharedSecret,
      messageSchema: input.messageSchema ?? {},
      rateLimits: input.rateLimits ?? {},
    })
    .returning();
  if (!row) throw AppError.internal('Failed to register channel');
  return { channel: row, sharedSecret };
}

export async function listChannels(orgId: string): Promise<CustomChannel[]> {
  return db
    .select()
    .from(customChannels)
    .where(and(eq(customChannels.orgId, orgId), isNull(customChannels.deletedAt)));
}

export async function getChannelBySlug(orgId: string, slug: string): Promise<CustomChannel | null> {
  const [row] = await db
    .select()
    .from(customChannels)
    .where(
      and(
        eq(customChannels.orgId, orgId),
        eq(customChannels.slug, slug),
        isNull(customChannels.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function disableChannel(orgId: string, id: string): Promise<void> {
  await db
    .update(customChannels)
    .set({ enabled: false })
    .where(and(eq(customChannels.orgId, orgId), eq(customChannels.id, id)));
}

export async function deleteChannel(orgId: string, id: string): Promise<void> {
  await db
    .update(customChannels)
    .set({ deletedAt: new Date() })
    .where(and(eq(customChannels.orgId, orgId), eq(customChannels.id, id)));
}

export async function rotateSecret(orgId: string, id: string): Promise<{ sharedSecret: string }> {
  const sharedSecret = crypto.randomBytes(32).toString('hex');
  await db
    .update(customChannels)
    .set({ sharedSecret, updatedAt: new Date() })
    .where(and(eq(customChannels.orgId, orgId), eq(customChannels.id, id)));
  return { sharedSecret };
}

// ─── Signing / verification ──────────────────────────────────────────────────

export function signBody(secret: string, timestamp: number, body: string): string {
  const h = crypto.createHmac('sha256', secret);
  h.update(`${timestamp}.${body}`);
  return h.digest('hex');
}

export function buildSignatureHeader(
  secret: string,
  body: string,
): {
  header: string;
  timestamp: number;
} {
  const timestamp = Date.now();
  const v1 = signBody(secret, timestamp, body);
  return { header: `t=${timestamp},v1=${v1}`, timestamp };
}

export function verifySignature(
  secret: string,
  header: string | undefined,
  body: string,
): { ok: boolean; reason?: string } {
  if (!header) return { ok: false, reason: 'missing signature' };
  const parts = Object.fromEntries(
    header.split(',').map((p) =>
      p
        .trim()
        .split('=')
        .map((s) => s.trim()),
    ),
  ) as Record<string, string>;
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: 'malformed signature' };
  if (Math.abs(Date.now() - t) > REPLAY_WINDOW_MS) return { ok: false, reason: 'stale signature' };

  const expected = signBody(secret, t, body);
  const a = Buffer.from(v1, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' };
  return { ok: true };
}

// ─── Outbound dispatch ───────────────────────────────────────────────────────

export interface DispatchInput {
  to: string | string[];
  body: string;
  subject?: string;
  metadata?: Record<string, unknown>;
}

export async function dispatch(
  orgId: string,
  slug: string,
  messageId: string,
  input: DispatchInput,
): Promise<{ ok: boolean; status: number; responseBody?: string }> {
  const channel = await getChannelBySlug(orgId, slug);
  if (!channel) throw AppError.notFound('Custom channel not found');
  if (!channel.enabled) throw AppError.badRequest('Channel disabled');

  const payload = {
    orgId,
    channel: slug,
    messageId,
    to: input.to,
    body: input.body,
    subject: input.subject,
    metadata: input.metadata ?? {},
    timestamp: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const maxBytes = channel.rateLimits.maxPayloadBytes ?? 256 * 1024;
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    throw AppError.badRequest(`Payload exceeds ${maxBytes}-byte limit`);
  }
  const { header } = buildSignatureHeader(channel.sharedSecret, rawBody);

  const res = await fetch(channel.outboundUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forgemsg-signature': header,
      'x-forgemsg-channel': slug,
    },
    body: rawBody,
  });
  const responseBody = await res.text().catch(() => undefined);
  return { ok: res.ok, status: res.status, responseBody };
}

// ─── Inbound handling ────────────────────────────────────────────────────────

export interface InboundVerified<T> {
  channel: CustomChannel;
  payload: T;
}

export async function verifyInbound<T = unknown>(
  orgId: string,
  slug: string,
  rawBody: string,
  signatureHeader: string | undefined,
): Promise<InboundVerified<T>> {
  const channel = await getChannelBySlug(orgId, slug);
  if (!channel) throw AppError.notFound('Custom channel not found');
  if (!channel.enabled) throw AppError.badRequest('Channel disabled');

  const v = verifySignature(channel.sharedSecret, signatureHeader, rawBody);
  if (!v.ok) throw AppError.badRequest(`Invalid signature: ${v.reason}`);

  let payload: T;
  try {
    payload = JSON.parse(rawBody) as T;
  } catch {
    throw AppError.badRequest('Inbound body is not valid JSON');
  }
  return { channel, payload };
}
