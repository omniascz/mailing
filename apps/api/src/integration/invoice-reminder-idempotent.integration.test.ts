/**
 * An invoice is reminded at most once a day, however many times the sweep runs.
 *
 * `sendDueReminders` used to select on the due date alone. It wrote
 * `reminders_sent + 1` and `last_reminder_at` afterwards and read neither back,
 * so a second run inside the same day re-selected every invoice it had just
 * processed and fired `onApiEvent(..., 'invoice_reminder', ...)` again — a
 * second payment chase to a customer who is not late. That is why the
 * invoice-reminder queue was the one cron in #98 given `attempts: 1`: it could
 * not be allowed to retry.
 *
 * These run against the real Postgres the migrations and seed ran against, and
 * they count what the function actually did rather than what it returned.
 *
 * WHAT THESE TESTS CANNOT SEE
 *  - They do not assert that a reminder is *delivered*. `onApiEvent` fires a
 *    workflow trigger; with no matching workflow in the seed org it does its
 *    lookup and returns. What is measured is how many times the function
 *    decides to fire, which is the thing that was doubling.
 *  - They do not cover the 3-day and 1-day rungs of the escalation as separate
 *    days. `REMINDER_INTERVALS_DAYS` is [7, 3, 1] and a single invoice can only
 *    match one of them on any given day, so the per-day invariant is what
 *    matters here; the ladder itself is unchanged by this fix.
 *  - They do not exercise two sweeps running concurrently. The claim is a
 *    conditional UPDATE and is safe under concurrency by construction, but
 *    proving that needs two connections racing, which this suite does not do.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoices, contacts, organizations } from '../db/schema/index.js';
import { sendDueReminders } from '../services/commerce/invoicing.js';

/** Days before the due date on which a reminder goes out. Mirrors the service. */
const SEVEN_DAYS = 7;

describe('invoice reminders are idempotent within a day (real DB)', () => {
  let orgId: string;
  let contactId: string;
  const createdInvoices: string[] = [];

  /** An invoice whose due date lands exactly on the 7-day rung. */
  async function makeInvoice(): Promise<string> {
    const due = new Date(Date.now() + SEVEN_DAYS * 86_400_000);
    const [row] = await db
      .insert(invoices)
      .values({
        orgId,
        contactId,
        invoiceNumber: `IDEM-${randomUUID().slice(0, 8)}`,
        status: 'sent',
        currency: 'CZK',
        total: '1000.00',
        amountDue: '1000.00',
        dueDate: due,
      })
      .returning({ id: invoices.id });
    createdInvoices.push(row!.id);
    return row!.id;
  }

  async function readMarks(id: string) {
    const [row] = await db
      .select({ sent: invoices.remindersSent, at: invoices.lastReminderAt })
      .from(invoices)
      .where(eq(invoices.id, id));
    return row!;
  }

  beforeAll(async () => {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, 'acme-demo'));
    if (!org) throw new Error('seed org acme-demo missing — run `pnpm seed`');
    orgId = org.id;

    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        email: `invoice-idem-${randomUUID().slice(0, 8)}@test.local`,
        status: 'active',
      })
      .returning({ id: contacts.id });
    contactId = c!.id;
  }, 60_000);

  afterAll(async () => {
    if (createdInvoices.length > 0) {
      await db.delete(invoices).where(inArray(invoices.id, createdInvoices));
    }
    if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  }, 60_000);

  beforeEach(async () => {
    // Other invoices in the seed data could land on a rung and make the
    // returned counts noisy, so every assertion below is about THIS invoice's
    // own marks rather than about the function's return value alone.
    if (createdInvoices.length > 0) {
      await db.delete(invoices).where(inArray(invoices.id, createdInvoices));
      createdInvoices.length = 0;
    }
  });

  it('reminds once on the first sweep', async () => {
    const id = await makeInvoice();
    await sendDueReminders();
    const after = await readMarks(id);
    expect(after.sent).toBe(1);
    expect(after.at).not.toBeNull();
  });

  it('a second sweep the same day adds nothing', async () => {
    const id = await makeInvoice();

    await sendDueReminders();
    const afterFirst = await readMarks(id);

    await sendDueReminders();
    const afterSecond = await readMarks(id);

    // The count is the reminder ledger. Before the fix this read 2 — measured.
    expect(afterFirst.sent).toBe(1);
    expect(afterSecond.sent).toBe(1);
    expect(afterSecond.at?.getTime()).toBe(afterFirst.at?.getTime());
  });

  it('five sweeps the same day still add nothing', async () => {
    // A retrying queue can run the sweep several times in a few minutes. The
    // whole point of the fix is that the number of runs stops mattering.
    const id = await makeInvoice();
    for (let i = 0; i < 5; i++) await sendDueReminders();
    expect((await readMarks(id)).sent).toBe(1);
  });

  it('an invoice reminded on an earlier day is reminded again', async () => {
    // The guard must be "not today", not "never again": the escalation sends
    // at 7, 3 and 1 days before the due date. An invoice whose last reminder
    // was yesterday is still eligible.
    const id = await makeInvoice();
    await db
      .update(invoices)
      .set({ remindersSent: 1, lastReminderAt: new Date(Date.now() - 86_400_000) })
      .where(eq(invoices.id, id));

    await sendDueReminders();

    expect((await readMarks(id)).sent).toBe(2);
  });

  it('an invoice that is not on a rung is left alone', async () => {
    // Due in four days: between the 7-day and 3-day rungs, so no sweep today
    // should touch it. Guards against a predicate that widened the selection.
    const id = await makeInvoice();
    await db
      .update(invoices)
      .set({ dueDate: new Date(Date.now() + 4 * 86_400_000) })
      .where(eq(invoices.id, id));

    await sendDueReminders();

    const after = await readMarks(id);
    expect(after.sent).toBe(0);
    expect(after.at).toBeNull();
  });

  it('a sweep that died half way through does not re-remind what it finished', async () => {
    // The real failure this fix is about: the process is killed mid-loop —
    // the stuck-connection reaper terminates a wedged backend after 15 s — so
    // some invoices are claimed and the rest are not. The retry must pick up
    // where it stopped, not start again.
    //
    // Modelled by hand rather than by killing a process: `alreadyDone` carries
    // today's mark, which is exactly the state the first sweep leaves behind
    // for an invoice it processed before dying.
    const alreadyDone = await makeInvoice();
    const notYet1 = await makeInvoice();
    const notYet2 = await makeInvoice();

    await db
      .update(invoices)
      .set({ remindersSent: 1, lastReminderAt: new Date() })
      .where(eq(invoices.id, alreadyDone));

    await sendDueReminders();

    // Untouched: it was finished before the crash.
    expect((await readMarks(alreadyDone)).sent).toBe(1);
    // Picked up: they were not.
    expect((await readMarks(notYet1)).sent).toBe(1);
    expect((await readMarks(notYet2)).sent).toBe(1);
  });

  it('a paid invoice is never reminded', async () => {
    const id = await makeInvoice();
    await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id));
    await sendDueReminders();
    expect((await readMarks(id)).sent).toBe(0);
  });
});
