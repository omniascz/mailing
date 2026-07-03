/**
 * Subscription topic service — topic CRUD + per-contact topic preferences,
 * with a default-status fallback (SES v2 Topics semantics).
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  subscriptionTopics,
  contactTopicSubscriptions,
  type SubscriptionTopic,
} from '../../db/schema/subscription-topics.js';
import { AppError } from '../../lib/app-error.js';

export type TopicDefault = 'opt_in' | 'opt_out';
export type SubStatus = 'subscribed' | 'unsubscribed';

/**
 * Pure: a contact's effective subscription to a topic. An explicit per-contact
 * row wins; otherwise the topic's default applies (opt_in → subscribed).
 */
export function effectiveTopicStatus(
  explicit: SubStatus | undefined,
  defaultStatus: TopicDefault,
): boolean {
  if (explicit) return explicit === 'subscribed';
  return defaultStatus === 'opt_in';
}

// ── Topic CRUD ──────────────────────────────────────────────────────────────

export async function listTopics(orgId: string): Promise<SubscriptionTopic[]> {
  return db
    .select()
    .from(subscriptionTopics)
    .where(eq(subscriptionTopics.orgId, orgId))
    .orderBy(asc(subscriptionTopics.displayName));
}

export async function createTopic(
  orgId: string,
  input: { name: string; displayName: string; description?: string; defaultStatus?: TopicDefault },
): Promise<SubscriptionTopic> {
  const [row] = await db
    .insert(subscriptionTopics)
    .values({
      orgId,
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      defaultStatus: input.defaultStatus ?? 'opt_in',
    })
    .returning();
  return row!;
}

export async function updateTopic(
  orgId: string,
  id: string,
  patch: Partial<{ displayName: string; description: string; defaultStatus: TopicDefault; active: boolean }>,
): Promise<SubscriptionTopic> {
  const [row] = await db
    .update(subscriptionTopics)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(subscriptionTopics.id, id), eq(subscriptionTopics.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('SubscriptionTopic');
  return row;
}

export async function deleteTopic(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(subscriptionTopics)
    .where(and(eq(subscriptionTopics.id, id), eq(subscriptionTopics.orgId, orgId)))
    .returning({ id: subscriptionTopics.id });
  if (!row) throw AppError.notFound('SubscriptionTopic');
}

// ── Contact preferences ───────────────────────────────────────────────────────

export interface ContactTopicView {
  topicId: string;
  name: string;
  displayName: string;
  description: string | null;
  subscribed: boolean;
}

/** List all active topics with the contact's effective status. */
export async function listContactTopics(
  orgId: string,
  contactId: string,
): Promise<ContactTopicView[]> {
  const topics = await db
    .select()
    .from(subscriptionTopics)
    .where(and(eq(subscriptionTopics.orgId, orgId), eq(subscriptionTopics.active, true)))
    .orderBy(asc(subscriptionTopics.displayName));

  const subs = await db
    .select({ topicId: contactTopicSubscriptions.topicId, status: contactTopicSubscriptions.status })
    .from(contactTopicSubscriptions)
    .where(
      and(
        eq(contactTopicSubscriptions.orgId, orgId),
        eq(contactTopicSubscriptions.contactId, contactId),
      ),
    );
  const explicit = new Map(subs.map((s) => [s.topicId, s.status as SubStatus]));

  return topics.map((t) => ({
    topicId: t.id,
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    subscribed: effectiveTopicStatus(explicit.get(t.id), t.defaultStatus as TopicDefault),
  }));
}

/** Set a contact's explicit status for a topic (upsert). */
export async function setContactTopicStatus(
  orgId: string,
  contactId: string,
  topicId: string,
  status: SubStatus,
): Promise<void> {
  await db
    .insert(contactTopicSubscriptions)
    .values({ orgId, contactId, topicId, status })
    .onConflictDoUpdate({
      target: [contactTopicSubscriptions.contactId, contactTopicSubscriptions.topicId],
      set: { status, updatedAt: new Date() },
    });
}
