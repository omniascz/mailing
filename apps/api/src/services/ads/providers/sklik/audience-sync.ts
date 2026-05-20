/**
 * Sklik (Seznam Business API) audience uploader (#421).
 *
 * Called from `services/ads/audience-sync.ts` when an ad-account row has
 * platform=`sklik`. Hashing + payload construction is in `./pure.ts` so this
 * module stays small and HTTP-focused.
 */

import { SKLIK_API_BASE } from '../../../../integrations/sklik/pure.js';
import { buildAudiencePayload, chunk, type AudienceMember, type SyncStats } from './pure.js';

export interface UploadOptions {
  accessToken: string;
  audienceName: string;
  members: AudienceMember[];
  /** Override for tests. */
  fetchImpl?: typeof globalThis.fetch;
  apiBase?: string;
}

export interface UploadResult {
  audienceId: string;
  stats: SyncStats;
}

interface CreateAudienceResponse {
  audience?: { id?: string };
  // Some Sklik endpoints return errors as `errors[].message`.
  errors?: Array<{ code?: string; message?: string }>;
}

/**
 * Push an audience to Sklik. Strategy:
 *   1. Create the audience via POST /audiences/create with the first batch.
 *   2. Append remaining batches via POST /audiences/{id}/append.
 *
 * Sklik's exact endpoint paths historically lived under `/drak/json/audiences`
 * — wired through `SKLIK_API_BASE`. The functions are tolerant of a swapped
 * base URL so tests can target a local mock.
 */
export async function uploadToSklik(opts: UploadOptions): Promise<UploadResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.apiBase ?? SKLIK_API_BASE;
  if (!opts.accessToken) throw new Error('Sklik access token is required');

  const batches = chunk(opts.members);
  if (batches.length === 0) {
    throw new Error('Cannot create a Sklik audience with zero members');
  }

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${opts.accessToken}`,
  };

  // 1. Create with the first batch.
  const firstPayload = buildAudiencePayload(opts.audienceName, batches[0]!);
  const createRes = await fetchImpl(`${base}/audiences/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(firstPayload),
  });
  const createJson = (await createRes.json()) as CreateAudienceResponse;
  if (!createRes.ok || !createJson.audience?.id) {
    const reason = createJson.errors?.[0]?.message ?? `HTTP ${createRes.status}`;
    throw new Error(`Sklik audience create failed: ${reason}`);
  }
  const audienceId = createJson.audience.id;

  // 2. Append the rest, if any.
  for (let i = 1; i < batches.length; i++) {
    const payload = buildAudiencePayload(opts.audienceName, batches[i]!);
    const appendRes = await fetchImpl(`${base}/audiences/${audienceId}/append`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customer_data: payload.customer_data }),
    });
    if (!appendRes.ok) {
      const text = await appendRes.text().catch(() => '');
      throw new Error(
        `Sklik audience append failed (batch ${i}): HTTP ${appendRes.status} ${text}`,
      );
    }
  }

  let hashedRows = 0;
  for (const b of batches)
    hashedRows += buildAudiencePayload(opts.audienceName, b).customer_data.length;

  return {
    audienceId,
    stats: { totalMembers: opts.members.length, hashedRows, batches: batches.length },
  };
}
