/**
 * C6 — a key that cannot be decrypted must never become unsigned mail.
 *
 * This is the assertion the whole branch stands on. Encrypting the column is
 * only an improvement if the failure mode is loud: if a wrong or missing
 * DKIM_MASTER_KEY quietly degraded to "send it unsigned", the operator would
 * see nothing, every customer domain would keep advertising a DKIM record in
 * DNS, and every message would arrive unauthenticated against it. On a
 * p=reject domain with SPF unaligned (VERP puts the return-path on our bounce
 * domain), that is rejected mail — fleet-wide, silent, discovered days later
 * as a deliverability slide.
 *
 * The resolver runs at ENQUEUE time in apps/api, never in the worker, so there
 * are three entry points to cover and they fail in three different ways.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

let dnsLive = false;
vi.mock('../services/domains/dkim.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, verifyDkimDns: vi.fn(async () => dnsLive) };
});

import { db } from '../db/client.js';
import { organizations, sendingDomains, dkimKeys, campaigns, lists } from '../db/schema/index.js';
import {
  createInitialKey,
  generateSelector,
  verifyAndPromotePending,
  DkimKeyDecryptionError,
  DKIM_MASTER_KEY_ENV,
} from '../services/domains/dkim-rotation.js';
import { generateDkimKeyPair } from '../services/domains/dkim.js';
import { campaignSplitterQueue, mtaOtherQueue, sendTransactionalEmail } from '../lib/queues.js';
import { enqueueCampaignSend, dispatchScheduledCampaigns } from '../services/campaigns/dispatch.js';

const tag = randomUUID().slice(0, 8);
const MASTER = 'ab'.repeat(32);
const WRONG = 'cd'.repeat(32);
const originalMaster = process.env[DKIM_MASTER_KEY_ENV];

const orgIds: string[] = [];
const domainIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];

let orgId: string;
let domain: string;

beforeAll(async () => {
  process.env[DKIM_MASTER_KEY_ENV] = MASTER;

  const [org] = await db
    .insert(organizations)
    .values({
      name: `dkim-c6-${tag}`,
      slug: `dkim-c6-${tag}`,
      // assertBulkSendAllowed refuses a sandbox org before the resolver is
      // ever reached, which would make this test pass for the wrong reason.
      sendingMode: 'production',
    })
    .returning({ id: organizations.id });
  orgId = org!.id;
  orgIds.push(orgId);

  domain = `c6-${tag}.test`;
  const [row] = await db.insert(sendingDomains).values({ orgId, domain }).returning();
  domainIds.push(row!.id);

  const selector = generateSelector(new Date());
  const pair = await generateDkimKeyPair('rsa');
  await createInitialKey(db, {
    orgId,
    domainId: row!.id,
    selector,
    privateKeyPem: pair.privateKeyPem,
    publicKeyBase64: pair.publicKeyBase64,
    keyType: pair.keyType,
  });
  dnsLive = true;
  await verifyAndPromotePending(orgId, row!.id);
  dnsLive = false;

  // assertFromDomainOwned needs the domain verified for this org.
  await db
    .update(sendingDomains)
    .set({ isVerified: true, dkimVerified: true })
    .where(eq(sendingDomains.id, row!.id));
}, 60_000);

afterAll(async () => {
  if (originalMaster === undefined) delete process.env[DKIM_MASTER_KEY_ENV];
  else process.env[DKIM_MASTER_KEY_ENV] = originalMaster;
  for (const id of campaignIds) await db.delete(campaigns).where(eq(campaigns.id, id));
  for (const id of listIds) await db.delete(lists).where(eq(lists.id, id));
  if (domainIds.length) {
    await db.delete(dkimKeys).where(inArray(dkimKeys.domainId, domainIds));
    await db.delete(sendingDomains).where(inArray(sendingDomains.id, domainIds));
  }
  for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
});

async function makeCampaign(label: string, status: 'draft' | 'scheduled', scheduledAt?: Date) {
  const [list] = await db
    .insert(lists)
    .values({ orgId, name: `c6-list-${label}-${tag}` })
    .returning({ id: lists.id });
  listIds.push(list!.id);

  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `c6-${label}-${tag}`,
      subject: 'Subject',
      fromName: 'Shop',
      fromEmail: `orders@${domain}`,
      listId: list!.id,
      content: { blocks: [{ type: 'text', text: 'hi' }] },
      type: 'email',
      status,
      scheduledAt: scheduledAt ?? null,
    })
    .returning({ id: campaigns.id });
  campaignIds.push(c!.id);
  return c!.id;
}

// ─── C6 (a) ───────────────────────────────────────────────────────────────────

describe('C6 (a) — campaigns: the send fails before anything is enqueued', () => {
  it('throws, and campaignSplitterQueue.add is never called', async () => {
    const campaignId = await makeCampaign('interactive', 'draft');
    const add = vi.spyOn(campaignSplitterQueue, 'add');
    process.env[DKIM_MASTER_KEY_ENV] = WRONG;
    try {
      await expect(enqueueCampaignSend(orgId, campaignId)).rejects.toThrow(DkimKeyDecryptionError);
      // The whole point: not one batch went out unsigned. The resolver sits
      // above campaignSplitterQueue.add in dispatch.ts, so the throw lands
      // before the queue is touched at all.
      expect(add).not.toHaveBeenCalled();
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
      add.mockRestore();
    }
  });

  it('succeeds and enqueues once the master key is right — the guard is not just "always throws"', async () => {
    const campaignId = await makeCampaign('happy', 'draft');
    const add = vi.spyOn(campaignSplitterQueue, 'add').mockResolvedValue({} as never);
    try {
      await enqueueCampaignSend(orgId, campaignId);
      expect(add).toHaveBeenCalledTimes(1);
      const payload = add.mock.calls[0]![1] as Record<string, unknown>;
      // …and what it enqueued is a real, decrypted signing key.
      expect(payload.dkimDomain).toBe(domain);
      expect(String(payload.dkimPrivateKey)).toContain('BEGIN PRIVATE KEY');
    } finally {
      add.mockRestore();
    }
  });
});

// ─── C6 (b) ───────────────────────────────────────────────────────────────────

describe('C6 (b) — scheduled campaigns: where the failure actually lands', () => {
  it('does not enqueue, counts the campaign as an error, and does not retry it', async () => {
    const campaignId = await makeCampaign('scheduled', 'scheduled', new Date(Date.now() - 60_000));
    const add = vi.spyOn(campaignSplitterQueue, 'add');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env[DKIM_MASTER_KEY_ENV] = WRONG;
    try {
      const first = await dispatchScheduledCampaigns(new Date());
      expect(add).not.toHaveBeenCalled();
      expect(first.errors).toBeGreaterThanOrEqual(1);
      expect(err).toHaveBeenCalled();

      // What state is the campaign left in? dispatchScheduledCampaigns calls
      // enqueueCampaignSend, which calls sendCampaign() — and sendCampaign
      // flips status to 'sending' BEFORE the DKIM resolver runs.
      //
      // When this test was written the throw left the row in 'sending' with no
      // rollback, and this assertion recorded that as the finding: 'sending' is
      // not a failed state, the cron only selects 'scheduled', and the campaign
      // was stuck with nothing but one console.error line to show for it.
      //
      // Both halves of that have since been closed. The rollback now covers the
      // email branch too, so the row lands in 'paused'; and it records WHY,
      // because a pause that queued nothing and a pause an operator chose need
      // opposite handling on resume. 'send_failed' is what makes this one
      // recoverable — see resumeCampaign.
      const [row] = await db
        .select({ status: campaigns.status, pausedReason: campaigns.pausedReason })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      expect(row!.status).toBe('paused');
      expect(row!.pausedReason).toBe('send_failed');

      // Second pass, master key repaired: the cron still does not retry it,
      // because it is no longer 'scheduled'. Recovery is an operator pressing
      // the button, not the cron coming back around — that part is unchanged,
      // and it is why the campaign has to land somewhere an operator can see.
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
      const second = await dispatchScheduledCampaigns(new Date());
      expect(second.dispatched).toBe(0);
      expect(add).not.toHaveBeenCalled();
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
      add.mockRestore();
      err.mockRestore();
    }
  });
});

// ─── C6 (c) ───────────────────────────────────────────────────────────────────

describe('C6 (c) — transactional: the catch no longer swallows it', () => {
  it('throws and enqueues nothing', async () => {
    const add = vi.spyOn(mtaOtherQueue, 'add');
    process.env[DKIM_MASTER_KEY_ENV] = WRONG;
    try {
      // Before this branch the call site was `.catch(() => null)`, and null
      // here means "send unsigned". A wrong master key would have produced a
      // successfully enqueued, unsigned password reset with a warning line
      // claiming the domain had no key.
      await expect(
        sendTransactionalEmail({
          orgId,
          from: `orders@${domain}`,
          to: 'someone@example.com',
          subject: 'Reset your password',
          html: '<p>hi</p>',
        }),
      ).rejects.toThrow(DkimKeyDecryptionError);
      expect(add).not.toHaveBeenCalled();
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
      add.mockRestore();
    }
  });

  it('a domain with genuinely no key still sends unsigned — null keeps its old meaning', async () => {
    // The separation has to cut both ways. This address has no domain row and
    // therefore no key, which is a normal answer, and the transactional path
    // must go on sending: a DOI confirmation that is never sent is a consent
    // record that never exists.
    const add = vi.spyOn(mtaOtherQueue, 'add').mockResolvedValue({} as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await sendTransactionalEmail({
        orgId,
        from: `noreply@unknown-${tag}.test`,
        to: 'someone@example.com',
        subject: 'Confirm your subscription',
        html: '<p>hi</p>',
      });
      expect(add).toHaveBeenCalledTimes(1);
      const payload = add.mock.calls[0]![1] as Record<string, unknown>;
      expect(payload.dkimPrivateKey).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      add.mockRestore();
      warn.mockRestore();
    }
  });
});
