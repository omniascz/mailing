/**
 * Social data enrichment (#218)
 *
 * Enriches a contact with social profile data (LinkedIn URL, Twitter/X handle,
 * company, job title, avatar URL) using a provider adapter pattern.
 *
 * Supported providers:
 *   - Clearbit (CLEARBIT_API_KEY) — person + company enrichment
 *   - Hunter.io (HUNTER_API_KEY) — email verification + LinkedIn
 *   - Stub adapter (dev/test) — returns deterministic fake data
 *
 * Results are cached in Redis for 30 days to avoid repeated API calls.
 * Enriched data is stored in contact.customFields under well-known keys.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days
const CACHE_PREFIX = 'enrich:social:';

export interface SocialProfile {
  linkedinUrl?: string;
  twitterHandle?: string;
  githubUsername?: string;
  avatarUrl?: string;
  jobTitle?: string;
  company?: string;
  companyDomain?: string;
  companySize?: string;
  bio?: string;
  location?: string;
  /** Source provider */
  source: string;
  /** When this data was fetched */
  fetchedAt: string;
}

// ─── Provider interface ───────────────────────────────────────────────────────

interface ISocialEnrichmentProvider {
  name: string;
  enrich(email: string): Promise<SocialProfile | null>;
}

// ─── Clearbit adapter ─────────────────────────────────────────────────────────

class ClearbitProvider implements ISocialEnrichmentProvider {
  name = 'clearbit';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async enrich(email: string): Promise<SocialProfile | null> {
    try {
      const res = await fetch(
        `https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8_000),
        },
      );

      if (res.status === 404 || res.status === 422) return null;
      if (!res.ok) throw new Error(`Clearbit ${res.status}`);

      const data = (await res.json()) as {
        person?: {
          linkedin?: { handle?: string };
          twitter?: { handle?: string };
          github?: { handle?: string };
          avatar?: string;
          title?: string;
          bio?: string;
          location?: string;
        };
        company?: {
          name?: string;
          domain?: string;
          metrics?: { employees?: string };
        };
      };

      return {
        linkedinUrl: data.person?.linkedin?.handle
          ? `https://linkedin.com/in/${data.person.linkedin.handle}`
          : undefined,
        twitterHandle: data.person?.twitter?.handle,
        githubUsername: data.person?.github?.handle,
        avatarUrl: data.person?.avatar,
        jobTitle: data.person?.title,
        bio: data.person?.bio,
        location: data.person?.location,
        company: data.company?.name,
        companyDomain: data.company?.domain,
        companySize: data.company?.metrics?.employees,
        source: 'clearbit',
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── Hunter.io adapter ────────────────────────────────────────────────────────

class HunterProvider implements ISocialEnrichmentProvider {
  name = 'hunter';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async enrich(email: string): Promise<SocialProfile | null> {
    try {
      const res = await fetch(
        `https://api.hunter.io/v2/email-enrichment?email=${encodeURIComponent(email)}&api_key=${this.apiKey}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return null;

      const body = (await res.json()) as {
        data?: {
          linkedin_url?: string;
          twitter?: string;
          avatar?: string;
          position?: string;
          company?: string;
          company_domain?: string;
          location?: string;
        };
      };
      const d = body.data;
      if (!d) return null;

      return {
        linkedinUrl: d.linkedin_url,
        twitterHandle: d.twitter,
        avatarUrl: d.avatar,
        jobTitle: d.position,
        company: d.company,
        companyDomain: d.company_domain,
        location: d.location,
        source: 'hunter',
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── Stub adapter (dev) ───────────────────────────────────────────────────────

class StubProvider implements ISocialEnrichmentProvider {
  name = 'stub';

  async enrich(email: string): Promise<SocialProfile | null> {
    const [user] = email.split('@');
    return {
      linkedinUrl: `https://linkedin.com/in/${user}`,
      twitterHandle: user,
      avatarUrl: `https://avatars.dicebear.com/api/identicon/${encodeURIComponent(email)}.svg`,
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      companyDomain: 'acme.com',
      location: 'Prague, CZ',
      source: 'stub',
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function createProvider(): ISocialEnrichmentProvider {
  if (process.env.CLEARBIT_API_KEY) return new ClearbitProvider(process.env.CLEARBIT_API_KEY);
  if (process.env.HUNTER_API_KEY) return new HunterProvider(process.env.HUNTER_API_KEY);
  return new StubProvider();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enrich a contact with social profile data.
 * Uses Redis cache (30d TTL) to avoid repeated API calls.
 * Merges enriched data into contact.customFields (non-destructive).
 */
export async function enrichContact(
  orgId: string,
  contactId: string,
): Promise<SocialProfile | null> {
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  if (!contact?.email) return null;

  // Check cache
  const cacheKey = `${CACHE_PREFIX}${contact.email}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const profile = JSON.parse(cached) as SocialProfile;
    return profile;
  }

  const provider = createProvider();
  const profile = await provider.enrich(contact.email);
  if (!profile) return null;

  // Cache result
  await redis.set(cacheKey, JSON.stringify(profile), 'EX', CACHE_TTL);

  // Merge into contact.customFields (preserves existing values, only fills missing ones)
  const existing = (contact.customFields ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  const fieldMap: Array<[keyof SocialProfile, string]> = [
    ['linkedinUrl', 'linkedin_url'],
    ['twitterHandle', 'twitter_handle'],
    ['githubUsername', 'github_username'],
    ['avatarUrl', 'avatar_url'],
    ['jobTitle', 'job_title'],
    ['company', 'company'],
    ['companyDomain', 'company_domain'],
    ['companySize', 'company_size'],
    ['bio', 'bio'],
    ['location', 'location'],
  ];

  for (const [profileKey, cfKey] of fieldMap) {
    const val = profile[profileKey];
    if (val !== undefined && !existing[cfKey]) {
      updates[cfKey] = val;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(contacts)
      .set({ customFields: { ...existing, ...updates }, updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
  }

  return profile;
}

/**
 * Bulk enrich a list of contacts (sequential, rate-limited).
 * Returns count of successful enrichments.
 */
export async function bulkEnrichContacts(
  orgId: string,
  contactIds: string[],
  delayMs = 200,
): Promise<{ enriched: number; failed: number }> {
  let enriched = 0;
  let failed = 0;

  for (const contactId of contactIds) {
    try {
      const result = await enrichContact(orgId, contactId);
      if (result) enriched++;
      else failed++;
    } catch {
      failed++;
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return { enriched, failed };
}
