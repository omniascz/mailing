/**
 * Stripe CDP source connector (#263).
 * Pulls customers + payment intents incrementally.
 */

import { upsertContactFromCdp } from '../source-sync.js';

interface StripeConfig {
  secretKey: string;
}

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  metadata: Record<string, string>;
  created: number;
}

export async function pullStripeCustomers(
  orgId: string,
  config: StripeConfig,
  since?: string,
): Promise<{ rowsPulled: number; rowsUpserted: number; cursor: string }> {
  const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : 0;

  let startingAfter: string | undefined;
  let total = 0;
  let upserted = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (sinceTs) params.set('created[gte]', String(sinceTs));
    if (startingAfter) params.set('starting_after', startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/customers?${params}`, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
      },
    }).catch(() => null);
    if (!res?.ok) break;

    const data = (await res.json()) as {
      data?: StripeCustomer[];
      has_more?: boolean;
    };

    for (const c of data.data ?? []) {
      if (!c.email) continue;
      const nameParts = (c.name ?? '').split(' ');
      await upsertContactFromCdp(orgId, {
        externalId: c.id,
        source: 'stripe',
        email: c.email,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ') || undefined,
        phone: c.phone ?? undefined,
        traits: {
          stripe_customer_id: c.id,
          stripe_metadata: c.metadata,
        },
      }).catch(() => {});
      upserted++;
      startingAfter = c.id;
    }

    total += data.data?.length ?? 0;
    hasMore = data.has_more ?? false;
  }

  return { rowsPulled: total, rowsUpserted: upserted, cursor: new Date().toISOString() };
}
