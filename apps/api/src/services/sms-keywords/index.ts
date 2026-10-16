/**
 * SMS keyword opt-in / opt-out router.
 * Inbound SMS gateway forwards plain-text bodies; we tokenize the first word
 * and dispatch the matching keyword action (subscribe/unsubscribe/info).
 */

import { and, eq, sql } from 'drizzle-orm';
import { emitWebhookEvent, toContactSummary } from '../webhooks/emit.js';
import { db } from '../../db/client.js';
import { smsKeywords, contacts, type SmsKeyword } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type KeywordAction = 'subscribe' | 'unsubscribe' | 'info' | 'reply';

export async function createKeyword(
  orgId: string,
  input: {
    keyword: string;
    action: KeywordAction;
    listId?: string;
    reply?: string;
  },
): Promise<SmsKeyword> {
  const [row] = await db
    .insert(smsKeywords)
    .values({
      orgId,
      keyword: input.keyword,
      action: input.action,
      listId: input.listId ?? null,
      reply: input.reply ?? null,
    })
    .returning();
  return row!;
}

export async function listKeywords(orgId: string): Promise<SmsKeyword[]> {
  return db.select().from(smsKeywords).where(eq(smsKeywords.orgId, orgId));
}

export async function deleteKeyword(orgId: string, id: string): Promise<void> {
  await db.delete(smsKeywords).where(and(eq(smsKeywords.id, id), eq(smsKeywords.orgId, orgId)));
}

export interface KeywordHit {
  matched: boolean;
  keyword?: SmsKeyword;
  reply?: string;
}

/** Match the first word against the org's keyword table. Increments hit_count on match. */
export async function dispatchInboundSms(
  orgId: string,
  input: {
    fromPhone: string;
    body: string;
  },
): Promise<KeywordHit> {
  const first = input.body.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return { matched: false };

  const [kw] = await db
    .select()
    .from(smsKeywords)
    .where(
      and(
        eq(smsKeywords.orgId, orgId),
        sql`LOWER(${smsKeywords.keyword}) = ${first}`,
        eq(smsKeywords.enabled, true),
      ),
    )
    .limit(1);
  if (!kw) return { matched: false };

  await db
    .update(smsKeywords)
    .set({ hitCount: sql`${smsKeywords.hitCount} + 1` })
    .where(eq(smsKeywords.id, kw.id));

  if (kw.action === 'subscribe') {
    // Find or create a contact by phone, attach to listId if any.
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, input.fromPhone)))
      .limit(1);
    if (!existing) {
      const [created] = await db
        .insert(contacts)
        .values({
          orgId,
          phone: input.fromPhone,
          // A keyword is consent to SMS, not to e-mail marketing: 'active'
          // here meant the contact got campaigns as soon as an e-mail reached
          // it — a PUT, a merge, an import (Z147 MIMO 5). Z172, položka 5.
          status: 'non_subscribed',
          source: 'sms_keyword',
        })
        .returning();
      if (created) {
        emitWebhookEvent(orgId, 'contact.created', {
          ...toContactSummary(created),
          source: 'sms_keyword',
        });
      }
    }
    // An existing contact keeps its status, whatever it is. A keyword texted
    // from this number is consent to SMS, not proof that the person behind an
    // e-mail address wants marketing. It used to write 'active' over every
    // status (unsubscribed and complained excepted since Z142): pending — a
    // double opt-in nobody confirmed — non_subscribed, bounced and an archive
    // of any of them, and the next campaign mailed each one (Z147, measured).
  } else if (kw.action === 'unsubscribe') {
    // Matched by phone, so the contact has to be resolved first —
    // unsubscribeContact works on a contact id, and STOP from a number we do
    // not know is a no-op rather than a blind UPDATE across the org.
    const [byPhone] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, input.fromPhone)))
      .limit(1);
    if (byPhone) {
      const { unsubscribeContact } = await import('../contacts/unsubscribe.js');
      await unsubscribeContact(orgId, byPhone.id, {
        scope: { kind: 'global' },
        source: 'sms_keyword',
        reason: `SMS keyword: ${kw.keyword}`,
      });
    }
  }

  return { matched: true, keyword: kw, reply: kw.reply ?? undefined };
}

export async function deleteKeywordOrThrow(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(smsKeywords)
    .where(and(eq(smsKeywords.id, id), eq(smsKeywords.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('SmsKeyword');
  await db.delete(smsKeywords).where(eq(smsKeywords.id, id));
}
