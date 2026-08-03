/**
 * FlexiBee / ABRA Flexi ERP integration.
 * REST API: https://www.flexibee.eu/api/
 * Contact (adresar) + invoice (faktura-vydana) sync.
 */
import { db } from '../../db/client.js';
import { erpSyncLog } from '../../db/schema/erp-sync.js';

export interface FlexibeeSettings {
  url: string; // e.g. https://app.flexibee.eu/c/MyCompany
  username: string;
  password: string;
  company: string;
}

export interface FlexibeeContact {
  id: string;
  nazev: string; // name
  email?: string;
  tel?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  stat?: string;
  ic?: string; // IČO
  dic?: string; // DIČ
}

async function flexibeeGet<T>(settings: FlexibeeSettings, path: string): Promise<T> {
  const creds = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  const base = settings.url.replace(/\/$/, '');
  const res = await fetch(`${base}/${path}`, {
    headers: {
      Authorization: `Basic ${creds}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`FlexiBee error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function flexibeePut(
  settings: FlexibeeSettings,
  path: string,
  body: unknown,
): Promise<unknown> {
  const creds = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  const base = settings.url.replace(/\/$/, '');
  const res = await fetch(`${base}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`FlexiBee PUT error ${res.status}: ${await res.text()}`);
  return res.json();
}

interface WinstromResponse<T> {
  winstrom: { adresar?: T[]; 'faktura-vydana'?: T[] };
}

export async function syncFlexibeeContacts(
  orgId: string,
  connectionId: string,
  settings: FlexibeeSettings,
): Promise<FlexibeeContact[]> {
  const started = new Date();
  try {
    const data = await flexibeeGet<WinstromResponse<FlexibeeContact>>(
      settings,
      `adresar.json?detail=full&limit=500`,
    );
    const contacts = data.winstrom.adresar ?? [];

    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'contacts',
      status: 'success',
      recordsIn: contacts.length,
      recordsOut: contacts.length,
      startedAt: started,
      finishedAt: new Date(),
    });

    return contacts;
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
}

export async function syncFlexibeeInvoices(
  orgId: string,
  connectionId: string,
  settings: FlexibeeSettings,
): Promise<number> {
  const started = new Date();
  try {
    const data = await flexibeeGet<WinstromResponse<Record<string, unknown>>>(
      settings,
      `faktura-vydana.json?detail=summary&limit=500`,
    );
    const invoices = data.winstrom['faktura-vydana'] ?? [];

    await db.insert(erpSyncLog).values({
      connectionId,
      orgId,
      entity: 'invoices',
      status: 'success',
      recordsIn: invoices.length,
      recordsOut: invoices.length,
      startedAt: started,
      finishedAt: new Date(),
    });

    return invoices.length;
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
}

/** Push a new contact (adresar) to FlexiBee */
export async function pushContactToFlexibee(
  settings: FlexibeeSettings,
  contact: Partial<FlexibeeContact>,
): Promise<void> {
  await flexibeePut(settings, 'adresar.json', {
    winstrom: { adresar: [contact] },
  });
}
