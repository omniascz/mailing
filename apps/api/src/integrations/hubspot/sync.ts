/**
 * HubSpot bi-directional sync: contacts and deals.
 *
 * ForgeMsg → HubSpot: upsert on contact create/update, deal create/update.
 * HubSpot → ForgeMsg: pull recent changes, upsert contacts, update deals.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { deals } from '../../db/schema/deals.js';
import { pipelines } from '../../db/schema/pipelines.js';
import { hubspotConnections, hubspotContactMap, hubspotDealMap } from '../../db/schema/hubspot.js';
import {
  getConnection,
  searchContacts,
  upsertContact,
  updateContact,
  getRecentContacts,
  createDeal,
  updateDeal,
  getRecentDeals,
  associateContactToDeal,
  type HsContactProperties,
  type HsDealProperties,
} from './client.js';

// ─── ForgeMsg → HubSpot ───────────────────────────────────────────────────────

export async function pushContactToHubSpot(orgId: string, contactId: string): Promise<void> {
  const conn = await getConnection(orgId);
  if (!conn.syncContacts) return;

  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId))).limit(1);
  if (!contact) return;

  const props: HsContactProperties = {
    email: contact.email ?? undefined,
    firstname: contact.firstName ?? undefined,
    lastname: contact.lastName ?? undefined,
    phone: contact.phone ?? undefined,
  };

  const [existing] = await db.select().from(hubspotContactMap).where(and(eq(hubspotContactMap.orgId, orgId), eq(hubspotContactMap.contactId, contactId))).limit(1);

  if (existing) {
    await updateContact(conn, String(existing.hubspotVid), props);
  } else {
    const existing_hs = await searchContacts(conn, contact.email ?? '');
    let hsContact = existing_hs[0];
    if (hsContact) {
      await updateContact(conn, hsContact.id, props);
    } else {
      hsContact = await upsertContact(conn, props);
    }
    await db.insert(hubspotContactMap).values({ orgId, contactId, hubspotVid: Number(hsContact.id) }).onConflictDoNothing();
  }
}

export async function pushDealToHubSpot(orgId: string, dealId: string, hsContactId?: string): Promise<void> {
  const conn = await getConnection(orgId);
  if (!conn.syncDeals) return;

  const [deal] = await db.select().from(deals).where(and(eq(deals.id, dealId), eq(deals.orgId, orgId))).limit(1);
  if (!deal) return;

  const props: HsDealProperties = {
    dealname: deal.name,
    amount: deal.value != null ? String(deal.value) : undefined,
    dealstage: deal.stageId ?? undefined,
    closedate: deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString() : undefined,
  };

  const [existing] = await db.select().from(hubspotDealMap).where(and(eq(hubspotDealMap.orgId, orgId), eq(hubspotDealMap.dealId, dealId))).limit(1);

  if (existing) {
    await updateDeal(conn, String(existing.hubspotDealId), props);
  } else {
    const hsDeal = await createDeal(conn, props);
    await db.insert(hubspotDealMap).values({ orgId, dealId, hubspotDealId: Number(hsDeal.id) }).onConflictDoNothing();
    if (hsContactId) {
      await associateContactToDeal(conn, hsContactId, hsDeal.id);
    }
  }
}

// ─── HubSpot → ForgeMsg ───────────────────────────────────────────────────────

export async function pullContactsFromHubSpot(orgId: string): Promise<{ synced: number }> {
  const conn = await getConnection(orgId);
  if (!conn.syncContacts) return { synced: 0 };

  let after: string | undefined;
  let synced = 0;

  do {
    const page = await getRecentContacts(conn, after);
    for (const hsContact of page.results) {
      const email = hsContact.properties.email;
      if (!email) continue;

      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)))
        .limit(1);

      let contactId: string;
      if (existing) {
        await db.update(contacts).set({
          firstName: hsContact.properties.firstname ?? undefined,
          lastName: hsContact.properties.lastname ?? undefined,
          phone: hsContact.properties.phone ?? undefined,
          updatedAt: new Date(),
        }).where(eq(contacts.id, existing.id));
        contactId = existing.id;
      } else {
        const [created] = await db.insert(contacts).values({
          orgId,
          email,
          firstName: hsContact.properties.firstname ?? null,
          lastName: hsContact.properties.lastname ?? null,
          phone: hsContact.properties.phone ?? null,
          source: 'hubspot',
        } as typeof contacts.$inferInsert).returning({ id: contacts.id });
        contactId = created!.id;
      }

      await db.insert(hubspotContactMap).values({ orgId, contactId, hubspotVid: Number(hsContact.id) }).onConflictDoNothing();
      synced++;
    }
    after = page.paging?.next?.after;
  } while (after);

  await db.update(hubspotConnections).set({ lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(hubspotConnections.orgId, orgId));
  return { synced };
}

export async function pullDealsFromHubSpot(orgId: string): Promise<{ synced: number }> {
  const conn = await getConnection(orgId);
  if (!conn.syncDeals) return { synced: 0 };

  let after: string | undefined;
  let synced = 0;

  do {
    const page = await getRecentDeals(conn, after);
    for (const hsDeal of page.results) {
      const [existing] = await db
        .select({ dealId: hubspotDealMap.dealId })
        .from(hubspotDealMap)
        .where(and(eq(hubspotDealMap.orgId, orgId), eq(hubspotDealMap.hubspotDealId, Number(hsDeal.id))))
        .limit(1);

      if (existing) {
        await db.update(deals).set({
          name: hsDeal.properties.dealname ?? undefined,
          ...(hsDeal.properties.amount ? { value: hsDeal.properties.amount } : {}),
          updatedAt: new Date(),
        }).where(eq(deals.id, existing.dealId));
      } else {
        const [pipeline] = await db.select({ id: pipelines.id, stages: pipelines.stages })
          .from(pipelines).where(eq(pipelines.orgId, orgId)).limit(1);
        if (!pipeline) { synced++; continue; }
        const firstStage = pipeline.stages[0]?.id ?? 'new';
        const [created] = await db.insert(deals).values({
          orgId,
          pipelineId: pipeline.id,
          stageId: hsDeal.properties.dealstage ?? firstStage,
          name: hsDeal.properties.dealname ?? 'Untitled Deal',
          value: hsDeal.properties.amount ?? '0',
          source: 'hubspot',
        } as typeof deals.$inferInsert).returning({ id: deals.id });
        if (created) {
          await db.insert(hubspotDealMap).values({ orgId, dealId: created.id, hubspotDealId: Number(hsDeal.id) }).onConflictDoNothing();
        }
      }
      synced++;
    }
    after = page.paging?.next?.after;
  } while (after);

  return { synced };
}
