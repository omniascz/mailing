/**
 * SMS keyword opt-in / opt-out router.
 * Inbound SMS gateway forwards plain-text bodies; we tokenize the first word
 * and dispatch the matching keyword action (subscribe/unsubscribe/info).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { smsKeywords, contacts, type SmsKeyword } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type KeywordAction = 'subscribe' | 'unsubscribe' | 'info' | 'reply';

export async function createKeyword(orgId: string, input: {
  keyword: string; action: KeywordAction; listId?: string; reply?: string;
}): Promise<SmsKeyword> {
  const [row] = await db.insert(smsKeywords).values({
    orgId, keyword: input.keyword, action: input.action,
    listId: input.listId ?? null, reply: input.reply ?? null,
  }).returning();
  return row!;
}

export async function listKeywords(orgId: string): Promise<SmsKeyword[]> {
  return db.select().from(smsKeywords).where(eq(smsKeywords.orgId, orgId));
}

export async function deleteKeyword(orgId: string, id: string): Promise<void> {
  await db.delete(smsKeywords)
    .where(and(eq(smsKeywords.id, id), eq(smsKeywords.orgId, orgId)));
}

export interface KeywordHit {
  matched: boolean;
  keyword?: SmsKeyword;
  reply?: string;
}

/** Match the first word against the org's keyword table. Increments hit_count on match. */
export async function dispatchInboundSms(orgId: string, input: {
  fromPhone: string; body: string;
}): Promise<KeywordHit> {
  const first = input.body.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return { matched: false };

  const [kw] = await db.select().from(smsKeywords).where(
    and(eq(smsKeywords.orgId, orgId), sql`LOWER(${smsKeywords.keyword}) = ${first}`, eq(smsKeywords.enabled, true)),
  ).limit(1);
  if (!kw) return { matched: false };

  await db.update(smsKeywords).set({ hitCount: sql`${smsKeywords.hitCount} + 1` })
    .where(eq(smsKeywords.id, kw.id));

  if (kw.action === 'subscribe') {
    // Find or create a contact by phone, attach to listId if any.
    const [existing] = await db.select().from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, input.fromPhone))).limit(1);
    if (!existing) {
      await db.insert(contacts).values({
        orgId, phone: input.fromPhone, status: 'active', source: 'sms_keyword',
      });
    } else if (existing.status !== 'active') {
      await db.update(contacts).set({ status: 'active' }).where(eq(contacts.id, existing.id));
    }
  } else if (kw.action === 'unsubscribe') {
    await db.update(contacts).set({ status: 'unsubscribed' })
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, input.fromPhone)));
  }

  return { matched: true, keyword: kw, reply: kw.reply ?? undefined };
}

export async function deleteKeywordOrThrow(orgId: string, id: string): Promise<void> {
  const [row] = await db.select().from(smsKeywords)
    .where(and(eq(smsKeywords.id, id), eq(smsKeywords.orgId, orgId))).limit(1);
  if (!row) throw AppError.notFound('SmsKeyword');
  await db.delete(smsKeywords).where(eq(smsKeywords.id, id));
}
