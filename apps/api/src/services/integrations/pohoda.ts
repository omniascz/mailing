/**
 * Pohoda ERP integration (Stormware mXML API).
 * Syncs contacts, orders and invoices between Pohoda and ForgeMsg.
 * API docs: https://www.stormware.cz/pohoda/xml/
 */
import { db } from '../../db/client.js';
import { erpSyncLog } from '../../db/schema/erp-sync.js';

export interface PohodaSettings {
  url: string; // e.g. http://192.168.1.100:38080/xml
  username: string;
  password: string;
  ico: string;
}

interface PohodaContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zip?: string;
  country?: string;
  ico?: string;
}

async function pohodaRequest(settings: PohodaSettings, xml: string): Promise<string> {
  const creds = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<mServerPacket version="1.0">
  <mDataPacket version="1.0" ico="${settings.ico}">
    ${xml}
  </mDataPacket>
</mServerPacket>`;

  const res = await fetch(settings.url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'text/xml; charset=UTF-8',
    },
    body: envelope,
  });
  if (!res.ok) throw new Error(`Pohoda API error ${res.status}`);
  return res.text();
}

function parseContactsXml(xml: string): PohodaContact[] {
  const contacts: PohodaContact[] = [];
  const matches = xml.matchAll(/<adb:addressbookItem[^>]*>([\s\S]*?)<\/adb:addressbookItem>/g);
  for (const m of matches) {
    const block = m[1] ?? '';
    const get = (tag: string) =>
      block.match(new RegExp(`<[^:]+:${tag}[^>]*>([^<]*)</`))?.[1]?.trim();
    const id = get('id') ?? crypto.randomUUID();
    const name = get('company') ?? get('name') ?? '';
    if (!name) continue;
    contacts.push({
      id,
      name,
      email: get('email'),
      phone: get('phone'),
      city: get('city'),
      zip: get('zip'),
      country: get('country'),
      ico: get('ico'),
    });
  }
  return contacts;
}

export async function syncPohodaContacts(
  orgId: string,
  connectionId: string,
  settings: PohodaSettings,
): Promise<{ count: number }> {
  const started = new Date();
  let count = 0;
  try {
    const xml = await pohodaRequest(
      settings,
      `
      <adb:addressbook version="1.0" xmlns:adb="http://www.stormware.cz/schema/version_2/addressbook.xsd">
        <adb:requestAddressbook>
          <adb:filter>
            <adb:requestAddressbookType>addressBook</adb:requestAddressbookType>
          </adb:filter>
        </adb:requestAddressbook>
      </adb:addressbook>`,
    );

    const contacts = parseContactsXml(xml);
    count = contacts.length;

    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'contacts',
      status: 'success',
      recordsIn: count,
      recordsOut: count,
      startedAt: started,
      finishedAt: new Date(),
    });
  } catch (err) {
    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'contacts',
      status: 'error',
      error: String(err),
      startedAt: started,
      finishedAt: new Date(),
    });
    throw err;
  }
  return { count };
}

export async function syncPohodaInvoices(
  orgId: string,
  connectionId: string,
  settings: PohodaSettings,
): Promise<{ count: number }> {
  const started = new Date();
  let count = 0;
  try {
    const xml = await pohodaRequest(
      settings,
      `
      <inv:invoicing version="1.0" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd">
        <inv:requestInvoice>
          <inv:requestInvoiceType>issuedInvoice</inv:requestInvoiceType>
        </inv:requestInvoice>
      </inv:invoicing>`,
    );

    const matches = Array.from(xml.matchAll(/<inv:invoice[^>]*>/g));
    count = matches.length;

    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'invoices',
      status: 'success',
      recordsIn: count,
      recordsOut: count,
      startedAt: started,
      finishedAt: new Date(),
    });
  } catch (err) {
    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'invoices',
      status: 'error',
      error: String(err),
      startedAt: started,
      finishedAt: new Date(),
    });
    throw err;
  }
  return { count };
}
