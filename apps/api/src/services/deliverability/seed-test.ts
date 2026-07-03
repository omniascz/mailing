/**
 * Real seed-list inbox placement testing.
 *
 * Unlike the heuristic inbox-placement sim, this sends the actual content to a
 * set of real seed mailboxes through the live pipeline, then records the ACTUAL
 * placement each provider reports (posted back by an inbox checker — IMAP
 * poller, provider API, or manual). Aggregation yields a true per-provider
 * inbox rate.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  seedAddresses,
  seedTests,
  seedResults,
  type SeedResult,
} from '../../db/schema/index.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { AppError } from '../../lib/app-error.js';

export type SeedPlacement = 'inbox' | 'spam' | 'promotions' | 'updates' | 'social' | 'missing';

// ── Seed address management ──────────────────────────────────────────────────

export async function addSeedAddress(orgId: string, provider: string, email: string) {
  const [row] = await db
    .insert(seedAddresses)
    .values({ orgId, provider: provider.toLowerCase(), email: email.toLowerCase() })
    .returning();
  return row!;
}

export function listSeedAddresses(orgId: string) {
  return db.select().from(seedAddresses).where(eq(seedAddresses.orgId, orgId));
}

export async function deleteSeedAddress(orgId: string, id: string) {
  const [row] = await db
    .delete(seedAddresses)
    .where(and(eq(seedAddresses.id, id), eq(seedAddresses.orgId, orgId)))
    .returning({ id: seedAddresses.id });
  if (!row) throw AppError.notFound('Seed address');
}

// ── Running a seed test ──────────────────────────────────────────────────────

export interface StartSeedTestInput {
  from: string;
  fromName?: string;
  subject: string;
  html?: string;
  text?: string;
  campaignId?: string;
}

/**
 * Send the content to every active seed address through the real pipeline and
 * open a test with one pending result per seed. Returns the testId. Throws if
 * the org has no active seed addresses.
 */
export async function startSeedTest(orgId: string, input: StartSeedTestInput) {
  const seeds = await db
    .select()
    .from(seedAddresses)
    .where(and(eq(seedAddresses.orgId, orgId), eq(seedAddresses.active, true)));
  if (seeds.length === 0) {
    throw AppError.badRequest('No active seed addresses configured');
  }

  const [test] = await db
    .insert(seedTests)
    .values({
      orgId,
      campaignId: input.campaignId ?? null,
      subject: input.subject,
      status: 'sent',
      sentCount: seeds.length,
    })
    .returning();

  for (const seed of seeds) {
    const messageId = `<seed-${randomUUID()}@forgemsg>`;
    await sendTransactionalEmail({
      to: seed.email,
      from: input.from,
      fromName: input.fromName,
      subject: input.subject,
      html: input.html ?? input.text ?? '',
      text: input.text,
      orgId,
      messageId,
    }).catch(() => {});
    await db.insert(seedResults).values({
      orgId,
      testId: test!.id,
      provider: seed.provider,
      email: seed.email,
      messageId,
    });
  }

  return test!;
}

/**
 * Record a real placement result for a seed (posted by the inbox checker).
 * Matched by seed email within the test. Marks the test complete once every
 * seed has reported.
 */
export async function recordSeedResult(
  orgId: string,
  testId: string,
  email: string,
  placement: SeedPlacement,
): Promise<void> {
  const [updated] = await db
    .update(seedResults)
    .set({ placement, arrived: placement !== 'missing', reportedAt: new Date() })
    .where(
      and(
        eq(seedResults.orgId, orgId),
        eq(seedResults.testId, testId),
        eq(seedResults.email, email.toLowerCase()),
      ),
    )
    .returning({ id: seedResults.id });
  if (!updated) throw AppError.notFound('Seed result for that address/test');

  const pending = await db
    .select({ id: seedResults.id })
    .from(seedResults)
    .where(and(eq(seedResults.testId, testId), isNull(seedResults.placement)))
    .limit(1);
  if (pending.length === 0) {
    await db.update(seedTests).set({ status: 'complete' }).where(eq(seedTests.id, testId));
  }
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export interface ProviderPlacement {
  provider: string;
  total: number;
  reported: number;
  inbox: number;
  spam: number;
  tabs: number; // promotions + updates + social
  missing: number;
  inboxRate: number; // inbox / reported, 0..1 (0 when nothing reported)
}

export interface SeedTestAggregate {
  byProvider: ProviderPlacement[];
  overall: { total: number; reported: number; inbox: number; inboxRate: number };
}

/**
 * Pure: fold per-seed results into per-provider placement + an overall inbox
 * rate. `inboxRate` is over *reported* seeds so pending checks don't skew it.
 */
export function aggregateSeedResults(
  results: Array<Pick<SeedResult, 'provider' | 'placement'>>,
): SeedTestAggregate {
  const map = new Map<string, ProviderPlacement>();
  const tabs = new Set(['promotions', 'updates', 'social']);
  let oTotal = 0;
  let oReported = 0;
  let oInbox = 0;

  for (const r of results) {
    let p = map.get(r.provider);
    if (!p) {
      p = { provider: r.provider, total: 0, reported: 0, inbox: 0, spam: 0, tabs: 0, missing: 0, inboxRate: 0 };
      map.set(r.provider, p);
    }
    p.total += 1;
    oTotal += 1;
    if (r.placement) {
      p.reported += 1;
      oReported += 1;
      if (r.placement === 'inbox') {
        p.inbox += 1;
        oInbox += 1;
      } else if (r.placement === 'spam') {
        p.spam += 1;
      } else if (r.placement === 'missing') {
        p.missing += 1;
      } else if (tabs.has(r.placement)) {
        p.tabs += 1;
      }
    }
  }

  const byProvider = [...map.values()]
    .map((p) => ({ ...p, inboxRate: p.reported ? Math.round((p.inbox / p.reported) * 100) / 100 : 0 }))
    .sort((a, b) => a.provider.localeCompare(b.provider));

  return {
    byProvider,
    overall: {
      total: oTotal,
      reported: oReported,
      inbox: oInbox,
      inboxRate: oReported ? Math.round((oInbox / oReported) * 100) / 100 : 0,
    },
  };
}

export async function getSeedTest(orgId: string, testId: string) {
  const [test] = await db
    .select()
    .from(seedTests)
    .where(and(eq(seedTests.id, testId), eq(seedTests.orgId, orgId)))
    .limit(1);
  if (!test) throw AppError.notFound('Seed test');
  const results = await db.select().from(seedResults).where(eq(seedResults.testId, testId));
  return { test, results, aggregate: aggregateSeedResults(results) };
}

export function listSeedTests(orgId: string) {
  return db
    .select()
    .from(seedTests)
    .where(eq(seedTests.orgId, orgId))
    .orderBy(desc(seedTests.createdAt))
    .limit(50);
}
