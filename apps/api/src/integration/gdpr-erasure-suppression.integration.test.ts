/**
 * The suppression an erasure leaves is written with the erasure or not at all,
 * and the daily date and name-day triggers honour it.
 *
 * ─── What was wrong (Z145, measured on master) ───────────────────────────────
 *
 * anonymizeContact scrubbed the contact first and inserted the suppression
 * last, in a try/catch that swallowed any failure: with the insert forced to
 * fail, POST /contacts/:id/anonymize answered 200, the contact was scrubbed
 * and no suppression existed. And the suppression it did write kept the hash
 * in notes, which the daily processors' sendable() never read, so the same
 * address created again started a birthday or name-day run.
 *
 * ─── What this file checks ───────────────────────────────────────────────────
 *
 *  - suppressionEmailHash() in JS and the hash Postgres computes for the
 *    audience and trigger queries are the same function of the address.
 *  - A failed suppression insert fails the erasure and leaves the contact as it
 *    was; a successful one writes email_hash and the notes marker.
 *  - date_field and name_day_today start no run for an address created again
 *    after its erasure, and still do for a similar address and a control.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  workflows,
  workflowRuns,
  suppressions,
} from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { createWorkflow, activateWorkflow } from '../services/workflows/index.js';
import {
  processDailyDateTriggers,
  processDailyNameDayTriggers,
} from '../services/workflows/triggers.js';
import { anonymizeContact } from '../services/contacts/gdpr.js';
import { suppressionEmailHash } from '../services/suppressions/email.js';
import { nameDaysFor } from '@forgemsg/i18n-cs/name-days';

const tag = randomUUID().slice(0, 8);
// 11 November has a Czech name day (Martin).
const DAY = new Date('2026-11-11T09:00:00Z');
const NAME = nameDaysFor(DAY)[0]!;

let orgId: string;
const who: Record<'erased' | 'similar' | 'control', string> = {} as never;
const created: string[] = [];

const NODES = [
  { id: 't', type: 'trigger', config: {} },
  { id: 'e1', type: 'send_email', config: { subject: 'probe', html: '<p>probe</p>' } },
];
const EDGES = [{ id: 'x', source: 't', target: 'e1' }];

async function flow(triggerType: string, triggerConfig: Record<string, unknown>) {
  const wf = await createWorkflow({
    orgId,
    name: `erasure ${tag} ${triggerType}`,
    triggerType: triggerType as never,
    triggerConfig,
    nodes: NODES as never,
    edges: EDGES as never,
  });
  await activateWorkflow(wf.id, orgId);
  created.push(wf.id);
  return wf.id;
}

async function runsBy(workflowId: string) {
  const runs = await db
    .select({ contactId: workflowRuns.contactId })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId));
  const n = (id: string) => runs.filter((r) => r.contactId === id).length;
  return { erased: n(who.erased), similar: n(who.similar), control: n(who.control) };
}

async function onDay(fn: () => Promise<unknown>) {
  vi.useFakeTimers({ toFake: ['Date'], now: DAY });
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
}

async function contact(email: string): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({
      orgId,
      email,
      firstName: NAME,
      status: 'active',
      customFields: { birthday: '1990-11-11' },
    })
    .returning({ id: contacts.id });
  return c!.id;
}

describe('an erasure suppresses with the erasure, and the daily triggers honour it (real DB)', () => {
  beforeAll(async () => {
    const [o] = await db
      .insert(organizations)
      .values({ name: 'erasure itest', slug: `erasure-${tag}` })
      .returning({ id: organizations.id });
    orgId = o!.id;
  }, 120_000);

  afterAll(async () => {
    await db.execute(sql`DROP TRIGGER IF EXISTS erasure_itest_fail ON suppressions`);
    await db.execute(sql`DROP FUNCTION IF EXISTS erasure_itest_fail()`);
    if (created.length) {
      await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, created));
      await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, created));
      await db.delete(workflows).where(inArray(workflows.id, created));
    }
    await db.delete(suppressions).where(eq(suppressions.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
  }, 120_000);

  it('the JS hash and the SQL hash of an address agree', async () => {
    const address = `  Jana.Erased-${tag}@Test.Local `;
    const [row] = (await db.execute(
      sql`SELECT encode(sha256(convert_to(lower(btrim(${address})), 'UTF8')), 'hex') AS h`,
    )) as unknown as Array<{ h: string }>;
    expect(row!.h).toBe(suppressionEmailHash(address));
    expect(suppressionEmailHash(address)).toBe(suppressionEmailHash(address.trim().toLowerCase()));
  });

  it('a failed suppression insert fails the erasure and leaves the contact as it was', async () => {
    const address = `erasure-fail-${tag}@test.local`;
    const id = await contact(address);
    const marker = `gdpr_anonymized:${suppressionEmailHash(address)}`;
    await db.execute(
      sql.raw(`CREATE OR REPLACE FUNCTION erasure_itest_fail() RETURNS trigger AS $$
        BEGIN
          IF NEW.notes = '${marker}' THEN RAISE EXCEPTION 'forced suppression insert failure'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`),
    );
    await db.execute(
      sql`CREATE TRIGGER erasure_itest_fail BEFORE INSERT ON suppressions
          FOR EACH ROW EXECUTE FUNCTION erasure_itest_fail()`,
    );
    try {
      await expect(anonymizeContact(orgId, id)).rejects.toThrow();
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS erasure_itest_fail ON suppressions`);
      await db.execute(sql`DROP FUNCTION IF EXISTS erasure_itest_fail()`);
    }
    const [after] = await db
      .select({ email: contacts.email, deletedAt: contacts.deletedAt })
      .from(contacts)
      .where(eq(contacts.id, id));
    expect(after).toEqual({ email: address, deletedAt: null });

    // Asked again, it goes through: scrubbed, and suppressed by hash.
    const done = await anonymizeContact(orgId, id);
    expect(done.emailHash).toBe(suppressionEmailHash(address));
    const rows = await db
      .select({
        email: suppressions.email,
        emailHash: suppressions.emailHash,
        notes: suppressions.notes,
      })
      .from(suppressions)
      .where(and(eq(suppressions.orgId, orgId), eq(suppressions.emailHash, done.emailHash)));
    expect(rows).toEqual([{ email: null, emailHash: done.emailHash, notes: marker }]);
  });

  it('date_field and name_day_today start no run for an address created again after its erasure', async () => {
    const address = `erasure-daily-${tag}@test.local`;
    await anonymizeContact(orgId, await contact(address));
    who.erased = await contact(address.toUpperCase());
    who.similar = await contact(`erasure-dailyx-${tag}@test.local`);
    who.control = await contact(`erasure-control-${tag}@test.local`);

    const dated = await flow('date_field', { field: 'birthday', offsetDays: 0 });
    await onDay(() => processDailyDateTriggers());
    expect(await runsBy(dated)).toEqual({ erased: 0, similar: 1, control: 1 });

    const named = await flow('name_day_today', {});
    await onDay(() => processDailyNameDayTriggers());
    expect(await runsBy(named)).toEqual({ erased: 0, similar: 1, control: 1 });
  });
});
