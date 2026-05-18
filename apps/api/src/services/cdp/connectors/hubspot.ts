/**
 * HubSpot CDP source connector (#263).
 * Pulls contacts + deals incrementally via the HubSpot Search API.
 */

import { upsertContactFromCdp } from '../source-sync.js';

interface HubSpotConfig {
  accessToken: string;
  portalId?: string;
  contactProperties?: string[];
}

interface HsContact {
  id: string;
  properties: Record<string, string | null>;
  updatedAt: string;
}

export async function pullHubSpotContacts(
  orgId: string,
  config: HubSpotConfig,
  since?: string,
): Promise<{ rowsPulled: number; rowsUpserted: number; cursor: string }> {
  const props = config.contactProperties ?? ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage'];
  let after: string | undefined;
  let total = 0;
  let upserted = 0;
  const lastModifiedDate = since ?? '2000-01-01T00:00:00.000Z';

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{
          propertyName: 'lastmodifieddate',
          operator: 'GTE',
          value: lastModifiedDate,
        }],
      }],
      properties: props,
      limit: 100,
    };
    if (after) body['after'] = after;

    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res?.ok) break;

    const data = (await res.json()) as {
      results?: HsContact[];
      paging?: { next?: { after?: string } };
    };

    for (const hs of data.results ?? []) {
      await upsertContactFromCdp(orgId, {
        externalId: hs.id,
        source: 'hubspot',
        email: hs.properties['email'] ?? undefined,
        firstName: hs.properties['firstname'] ?? undefined,
        lastName: hs.properties['lastname'] ?? undefined,
        phone: hs.properties['phone'] ?? undefined,
        company: hs.properties['company'] ?? undefined,
        traits: {
          hubspot_lifecycle: hs.properties['lifecyclestage'],
          hubspot_contact_id: hs.id,
        },
      }).catch(() => {});
      upserted++;
    }

    total += data.results?.length ?? 0;
    after = data.paging?.next?.after;
  } while (after);

  return { rowsPulled: total, rowsUpserted: upserted, cursor: new Date().toISOString() };
}
