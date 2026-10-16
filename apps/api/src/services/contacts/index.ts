import { and, asc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { emitWebhookEvent, toContactSummary, changedFields } from '../webhooks/emit.js';
import type { ContactSource } from '../webhooks/payloads.js';
import { db } from '../../db/client.js';
import { contacts, type Contact } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { parsePhonePrefix } from '../import/phone-prefix.js';
import type { UnsubscribeSource } from './unsubscribe.js';
import {
  activeBlockingRows,
  assertBounceReleased,
  assertNoHeldSuppression,
  assertNotLiftingRefusal,
  heldStatus,
} from './consent-hold.js';
import { normalizeEmail } from '../../lib/email-address.js';
import {
  contactExists,
  emailTakenBy,
  findOrCreateContact,
  isContactEmailConflict,
} from './by-email.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListContactsOpts {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: Contact['status'];
  list_id?: string;
  tag_id?: string;
  phone_operator?: string;
  phone_district?: string;
}

export interface CreateContactInput {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  status?: Contact['status'];
  isVip?: boolean;
  customFields?: Record<string, unknown>;
  source?: string;
  sourceDetails?: Record<string, unknown>;
  emailValidationScore?: string;
  emailValidatedAt?: Date;
  // Phone intelligence (auto-populated by enrichPhone)
  phoneType?: Contact['phoneType'];
  phoneOperator?: string;
  phoneRegion?: string;
  phoneDistrict?: string;
  phoneCountry?: string;
  phoneLookupAt?: Date;
}

export type UpdateContactInput = Partial<
  Omit<CreateContactInput, 'emailValidationScore' | 'emailValidatedAt'> & {
    leadScore?: string;
    emailValidationScore?: string;
    emailValidatedAt?: Date;
  }
>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFilterConditions(orgId: string, opts: Omit<ListContactsOpts, 'cursor' | 'limit'>) {
  const conditions = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];

  if (opts.status) {
    conditions.push(eq(contacts.status, opts.status));
  }
  if (opts.phone_operator) {
    conditions.push(eq(contacts.phoneOperator, opts.phone_operator));
  }
  if (opts.phone_district) {
    conditions.push(eq(contacts.phoneDistrict, opts.phone_district));
  }
  if (opts.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(contacts.email, q),
        ilike(contacts.firstName, q),
        ilike(contacts.lastName, q),
        ilike(contacts.phone, q),
      )!,
    );
  }
  if (opts.tag_id) {
    conditions.push(
      sql`${contacts.id} IN (SELECT contact_id FROM contact_tags WHERE tag_id = ${opts.tag_id}::uuid)`,
    );
  }
  if (opts.list_id) {
    conditions.push(
      sql`${contacts.id} IN (SELECT contact_id FROM contact_lists WHERE list_id = ${opts.list_id}::uuid)`,
    );
  }

  return conditions;
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function listContacts(orgId: string, opts: ListContactsOpts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const filterConds = buildFilterConditions(orgId, opts);

  // Page query includes cursor
  const pageConds = [...filterConds];
  if (opts.cursor) pageConds.push(gt(contacts.id, opts.cursor));

  const rows = await db
    .select()
    .from(contacts)
    .where(and(...pageConds))
    .orderBy(asc(contacts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(...filterConds));
  const total = countRow?.count ?? 0;

  return { data, cursor: nextCursor, hasMore, total };
}

export async function getContact(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('Contact');
  return row;
}

/**
 * Enrich a contact input with phone prefix data (operator, type, region, country).
 * This is the same enrichment the import pipeline runs.
 */
function enrichPhone(input: CreateContactInput): CreateContactInput {
  if (!input.phone) return input;
  const info = parsePhonePrefix(input.phone);
  if (!info.isValid) return input;
  return {
    ...input,
    phone: info.normalized,
    phoneType: info.type === 'unknown' ? undefined : (info.type ?? undefined),
    phoneOperator: info.operator ?? undefined,
    phoneRegion: info.region ?? undefined,
    phoneDistrict: info.district ?? undefined,
    phoneCountry: info.country ?? undefined,
    phoneLookupAt: new Date(),
  };
}

/**
 * Webhook events are emitted from HERE rather than from the routes, because
 * these four functions are what every single-contact path goes through —
 * POST /contacts, the Zapier action, the Resend-compat audience routes, the
 * VIP toggle, archive and unarchive. Emitting at the routes would mean six
 * call sites for contact.updated alone, and the next route added would
 * silently not emit. This is the choke point.
 *
 * Paths that write to `contacts` directly (signup forms, SMS keywords, the
 * inbox, ticketing, lead ads, Calendly, CDP identity resolution) do not come
 * through here and emit for themselves. Bulk paths — CSV import, the four
 * provider migrations, e-shop sync, sandboxes — deliberately do not emit at
 * all; see docs/WEBHOOK-EVENTS.md.
 */
export async function createContact(
  orgId: string,
  input: CreateContactInput,
  source: ContactSource = 'api',
) {
  // One address, one contact (./by-email.ts): an address the org already holds
  // is refused with the existing contact's id rather than created twice.
  const email = input.email === undefined ? undefined : normalizeEmail(input.email);
  if (email) {
    const existing = await emailTakenBy(orgId, email);
    if (existing) throw contactExists(existing);
  }
  let row: Contact | undefined;
  try {
    [row] = await db
      .insert(contacts)
      .values({ orgId, ...enrichPhone(input), ...(email === undefined ? {} : { email }) })
      .returning();
  } catch (err) {
    // Lost a race to the same address: the answer is the same 409.
    if (email && isContactEmailConflict(err)) {
      const existing = await emailTakenBy(orgId, email);
      if (existing) throw contactExists(existing);
    }
    throw err;
  }
  emitWebhookEvent(orgId, 'contact.created', { ...toContactSummary(row!), source });
  return row!;
}

/**
 * createContact for a path that should take the contact already there
 * (Zapier, Mall.cz, Allegro): an existing contact is returned with its status
 * untouched and only its empty name and phone filled.
 */
export async function createOrFindContact(
  orgId: string,
  input: CreateContactInput & { email: string },
  source: ContactSource = 'api',
): Promise<{ contact: Contact; created: boolean }> {
  try {
    return { contact: await createContact(orgId, input, source), created: true };
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'CONTACT_EXISTS') throw err;
    return findOrCreateContact(
      orgId,
      input.email,
      {},
      { fill: { firstName: input.firstName, lastName: input.lastName, phone: input.phone } },
    );
  }
}

/**
 * A batch either creates every contact or none. An address the org already
 * holds, or one that appears twice in the batch, refuses the whole batch with
 * the colliding addresses in `details.conflicts`.
 */
export async function createContactsBatch(
  orgId: string,
  inputs: CreateContactInput[],
  source: ContactSource = 'api',
) {
  const values = inputs.map((input) => ({
    orgId,
    ...enrichPhone(input),
    ...(input.email === undefined ? {} : { email: normalizeEmail(input.email) }),
  }));
  const emails = values.flatMap((v) => (v.email ? [v.email] : []));
  const seen = new Set<string>();
  const conflicts = new Set<string>();
  for (const e of emails) {
    if (seen.has(e)) conflicts.add(e);
    seen.add(e);
  }
  const refuse = (existing: Array<{ id: string; email: string | null }>) =>
    new AppError({
      code: 'CONTACT_EXISTS',
      message: 'Some addresses in this batch already belong to a contact, or appear twice',
      statusCode: 409,
      details: {
        conflicts: [...new Set([...conflicts, ...existing.map((r) => r.email!)])].sort(),
        existing: existing.map((r) => ({ id: r.id, email: r.email })),
      },
    });
  const taken = async () =>
    emails.length === 0
      ? []
      : db
          .select({ id: contacts.id, email: contacts.email })
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              inArray(contacts.email, [...seen]),
              isNull(contacts.deletedAt),
            ),
          );
  const existing = await taken();
  if (existing.length > 0 || conflicts.size > 0) throw refuse(existing);

  let rows: Contact[];
  try {
    rows = await db.insert(contacts).values(values).returning();
  } catch (err) {
    if (isContactEmailConflict(err)) throw refuse(await taken());
    throw err;
  }
  // Per contact: this is the API batch endpoint, which is bounded by the
  // request body, not the CSV importer that handles hundreds of thousands.
  for (const row of rows) {
    emitWebhookEvent(orgId, 'contact.created', { ...toContactSummary(row), source });
  }
  return rows;
}

/**
 * Context for a status change, when the caller is the one who knows it.
 *
 * `source` is passed in rather than guessed. This function cannot tell an
 * admin clicking in the UI from a script calling the API — both arrive as the
 * same patch — and the distinction is the whole point of recording it:
 * deliverability cares whether the recipient asked to leave or whether an
 * operator marked them.
 */
export interface UpdateContactContext {
  source?: UnsubscribeSource;
}

export async function updateContact(
  orgId: string,
  id: string,
  patch: UpdateContactInput,
  ctx: UpdateContactContext = {},
) {
  // Read before the write so a transition can be told from a no-op: patching
  // status to 'unsubscribed' on someone already unsubscribed is not an
  // unsubscribe, and must not produce a second event.
  const [before] = await db
    .select({ status: contacts.status, archivedFrom: contacts.archivedFrom, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  // Every single-contact edit comes through here, so this is where an edit is
  // stopped from lifting a recipient's refusal, from making a contact who
  // never said yes (pending, non_subscribed) active, from making a bounced
  // contact active while its bounce row stands, or from making any contact
  // active while a complaint, unsubscribe or manual row stands
  // (./consent-hold.ts) — all before anything is written. The rows are read
  // once, on the address the contact will have after this edit, which is
  // where mail would go; when both row checks apply, BOUNCE_ACTIVE answers. An
  // archive keeps the status it replaced; any other status leaves the archive
  // and clears it.
  const nextStatus = (patch as { status?: Contact['status'] }).status;
  let archivedFrom: Contact['status'] | null | undefined;
  if (before && nextStatus !== undefined && nextStatus !== before.status) {
    const held = await heldStatus(orgId, before);
    assertNotLiftingRefusal(held, nextStatus);
    if (nextStatus === 'active') {
      const address = patch.email !== undefined ? patch.email : before.email;
      const rows = await activeBlockingRows(orgId, address);
      assertBounceReleased(held, nextStatus, rows);
      assertNoHeldSuppression(before.status, nextStatus, rows);
    }
    if (nextStatus === 'archived') archivedFrom = before.status;
    else if (before.status === 'archived') archivedFrom = null;
  }

  // A changed address is stored normalised, and may not be one another live
  // contact already has.
  if (patch.email !== undefined && patch.email !== null) {
    patch = { ...patch, email: normalizeEmail(patch.email) };
    const other = await emailTakenBy(orgId, patch.email!, id);
    if (other) throw contactExists(other);
  }

  const becomingUnsubscribed =
    (patch as { status?: string }).status === 'unsubscribed' && before?.status !== 'unsubscribed';

  // Only that one transition is diverted. bounced, complained, archived, active
  // and every other patch keep the exact behaviour they had — they are not
  // unsubscribes and have their own handling elsewhere.
  if (becomingUnsubscribed) {
    const { unsubscribeContact } = await import('./unsubscribe.js');
    await unsubscribeContact(orgId, id, {
      scope: { kind: 'global' },
      source: ctx.source ?? 'api',
    });
    // unsubscribeContact has written status + suppression + the per-list rows.
    // Drop status from the patch so the update below cannot fight it, and let
    // the rest of the patch through unchanged.
    const rest = { ...(patch as Record<string, unknown>) };
    delete rest.status;
    if (Object.keys(rest).length === 0) {
      const [row] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)))
        .limit(1);
      if (!row) throw AppError.notFound('Contact');
      emitWebhookEvent(orgId, 'contact.updated', {
        ...toContactSummary(row),
        changed: changedFields(patch as Record<string, unknown>),
      });
      return row;
    }
    patch = rest as UpdateContactInput;
  }

  let row: Contact | undefined;
  try {
    [row] = await db
      .update(contacts)
      .set({
        ...patch,
        ...(archivedFrom !== undefined ? { archivedFrom } : {}),
        updatedAt: new Date(),
      } as never)
      .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
      .returning();
  } catch (err) {
    if (patch.email && isContactEmailConflict(err)) {
      const other = await emailTakenBy(orgId, patch.email, id);
      if (other) throw contactExists(other);
    }
    throw err;
  }
  if (!row) throw AppError.notFound('Contact');
  // After the write, so an event is never emitted for an update that failed.
  emitWebhookEvent(orgId, 'contact.updated', {
    ...toContactSummary(row),
    changed: changedFields(patch as Record<string, unknown>),
  });
  return row;
}

/**
 * Undo an archive: the contact gets back the status the archive replaced, so
 * an unsubscribed contact comes back unsubscribed. This used to set 'active'
 * from whatever the status was — archived or not — which turned an
 * unsubscribed contact into a marketing recipient in one call (Z142, measured).
 * Written here rather than through updateContact: restoring 'unsubscribed' is
 * not a new unsubscribe and must not run one.
 */
export async function unarchiveContact(orgId: string, id: string) {
  const [before] = await db
    .select({ status: contacts.status, archivedFrom: contacts.archivedFrom, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!before) throw AppError.notFound('Contact');
  if (before.status !== 'archived') {
    throw AppError.conflict(`Contact is not archived (status ${before.status})`);
  }
  const status = await heldStatus(orgId, before);
  const [row] = await db
    .update(contacts)
    .set({ status, archivedFrom: null, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), eq(contacts.status, 'archived')))
    .returning();
  if (!row) throw AppError.conflict('Contact is not archived');
  emitWebhookEvent(orgId, 'contact.updated', {
    ...toContactSummary(row),
    changed: changedFields({ status }),
  });
  return row;
}

export async function deleteContact(orgId: string, id: string) {
  const [row] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Contact');
  // Identifiers only: the rest of the row is no longer current information.
  emitWebhookEvent(orgId, 'contact.deleted', { id: row.id, email: row.email ?? null });
}
