/**
 * Calendly webhook event processor.
 *
 * On invitee.created:
 *   1. Upsert contact (email from invitee)
 *   2. Optionally create a deal in the CRM
 *   3. Optionally trigger a workflow
 */

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { deals } from '../../db/schema/deals.js';
import { pipelines } from '../../db/schema/pipelines.js';
import { calendlyConnections } from '../../db/schema/calendly.js';

export interface CalendlyInviteeEvent {
  event: 'invitee.created' | 'invitee.canceled';
  payload: {
    invitee: {
      uri: string;
      email: string;
      name: string;
      first_name?: string;
      last_name?: string;
    };
    event_type: {
      name: string;
      uri: string;
    };
    scheduled_event: {
      uri: string;
      start_time: string;
      end_time: string;
    };
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string, signingKey: string): boolean {
  const expected = crypto.createHmac('sha256', signingKey).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export async function processCalendlyEvent(orgId: string, event: CalendlyInviteeEvent): Promise<void> {
  const [conn] = await db.select().from(calendlyConnections).where(eq(calendlyConnections.orgId, orgId)).limit(1);
  if (!conn) return;

  if (event.event === 'invitee.created') {
    const invitee = event.payload.invitee;
    const [firstName, ...rest] = (invitee.name ?? '').split(' ');
    const lastName = rest.join(' ') || null;

    // Upsert contact
    const [existing] = await db.select({ id: contacts.id }).from(contacts)
      .where(eq(contacts.email, invitee.email))
      .limit(1);

    let contactId: string;
    if (existing) {
      contactId = existing.id;
    } else {
      const [created] = await db.insert(contacts).values({
        orgId,
        email: invitee.email,
        firstName: invitee.first_name ?? firstName ?? null,
        lastName: invitee.last_name ?? lastName,
        source: 'calendly',
      } as typeof contacts.$inferInsert).returning({ id: contacts.id });
      contactId = created!.id;
    }

    // Optionally create a deal
    if (conn.createDeal) {
      const [pipeline] = await db.select({ id: pipelines.id, stages: pipelines.stages })
        .from(pipelines).where(eq(pipelines.orgId, orgId)).limit(1);
      if (pipeline) {
        const firstStage = pipeline.stages[0]?.id ?? 'new';
        await db.insert(deals).values({
          orgId,
          pipelineId: pipeline.id,
          stageId: firstStage,
          name: `Calendly: ${event.payload.event_type.name} — ${invitee.name}`,
          contactId,
          source: 'calendly',
        } as typeof deals.$inferInsert);
      }
    }

    // Optionally fire workflow trigger via internal API
    if (conn.workflowTrigger) {
      const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
      await fetch(`${apiUrl}/api/v1/internal/workflows/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          trigger: conn.workflowTrigger,
          contactId,
          metadata: { calendly_event: event.payload.scheduled_event.uri },
        }),
      }).catch(() => { /* non-critical */ });
    }
  }
}
