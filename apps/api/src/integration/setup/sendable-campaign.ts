/**
 * What a test campaign needs to be one production would actually send.
 *
 * Since Z125 the pre-send verdict is enforced at the send (services/pre-send/
 * send-gate.ts), so a fixture that is not sendable is refused with 422 before
 * the code under test runs. The pieces below are the ones the fixtures were
 * missing, and each was a campaign the batch-sender would have refused or a
 * mailbox provider would have rejected:
 *
 *   authenticateSender  SPF, DKIM and DMARC verified on the From domain
 *   addRecipient        one contact on the list, so the audience is not empty
 *   SENDABLE_CONTENT    a block schema the renderer recognises — it attaches
 *                       the opt-out footer to it, as it does to every
 *                       marketing message
 *
 * Deliberately no acknowledgeDeliverabilityRisk: a fixture that overrides the
 * gate would hide a regression in it.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { contacts, contactLists, sendingDomains } from '../../db/schema/index.js';

export const SENDABLE_CONTENT = {
  subject: 'Novinky',
  blocks: [
    {
      id: 'b1',
      type: 'text',
      content: '<p>Dobrý den.</p>',
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#111827',
      lineHeight: '1.5',
      textAlign: 'left',
    },
  ],
  globalStyles: {
    backgroundColor: '#fff',
    contentBackgroundColor: '#fff',
    fontFamily: 'Arial',
    linkColor: '#00f',
    textColor: '#000',
    contentWidth: 600,
  },
};

/** The From domain, verified the way a customer verifies it: SPF, DKIM and DMARC. */
export async function authenticateSender(orgId: string, fromEmail: string): Promise<void> {
  const domain = fromEmail.split('@')[1]!.toLowerCase();
  await db
    .insert(sendingDomains)
    .values({
      orgId,
      domain,
      isVerified: true,
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
    })
    .onConflictDoNothing();
}

/** One active contact on the list. Removed with the organisation (cascade). */
export async function addRecipient(orgId: string, listId: string): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `recipient-${randomUUID().slice(0, 8)}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  await db.insert(contactLists).values({ contactId: c!.id, listId });
  return c!.id;
}
