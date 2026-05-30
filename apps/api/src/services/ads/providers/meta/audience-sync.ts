/**
 * Meta (Facebook + Instagram) Custom Audience uploader.
 *
 * Two-step flow:
 *   1. POST /act_{adAccountId}/customaudiences        create with metadata
 *   2. POST /{audienceId}/users                        upload N batches
 *
 * Hashing lives in `./pure.ts`. This module is HTTP-only.
 *
 * Spec: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences
 */

import { buildMetaPayload, chunkMeta, validateMetaAudienceName } from './pure.js';
import type { MetaAudienceMember, MetaSyncStats } from './pure.js';

const META_API_BASE = 'https://graph.facebook.com/v19.0';

export interface MetaUploadOptions {
  accessToken: string;
  adAccountId: string;
  audienceName: string;
  members: MetaAudienceMember[];
  /** Override for tests. */
  fetchImpl?: typeof globalThis.fetch;
  apiBase?: string;
}

export interface MetaUploadResult {
  audienceId: string;
  stats: MetaSyncStats;
}

interface MetaCreateResponse {
  id?: string;
  error?: { message?: string; type?: string };
}

export async function uploadToMeta(opts: MetaUploadOptions): Promise<MetaUploadResult> {
  if (!opts.accessToken) throw new Error('Meta access token is required');
  if (!opts.adAccountId) throw new Error('Meta ad account id is required');
  const audienceName = validateMetaAudienceName(opts.audienceName);

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.apiBase ?? META_API_BASE;

  // 1. Create audience.
  const createRes = await fetchImpl(`${base}/act_${opts.adAccountId}/customaudiences`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: audienceName,
      subtype: 'CUSTOM',
      description: 'MailForge CRM audience sync',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: opts.accessToken,
    }),
  });
  const createJson = (await createRes.json()) as MetaCreateResponse;
  if (!createRes.ok || !createJson.id) {
    const reason = createJson.error?.message ?? `HTTP ${createRes.status}`;
    throw new Error(`Meta audience create failed: ${reason}`);
  }
  const audienceId = createJson.id;

  // 2. Upload member batches.
  const memberBatches = chunkMeta(opts.members);
  let totalRows = 0;
  for (let i = 0; i < memberBatches.length; i++) {
    const batch = memberBatches[i]!;
    const payload = buildMetaPayload(batch);
    if (payload.data.length === 0) continue;
    totalRows += payload.data.length;

    const res = await fetchImpl(`${base}/${audienceId}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: {
          schema: payload.schema,
          data: payload.data,
        },
        access_token: opts.accessToken,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Meta user upload failed (batch ${i}): HTTP ${res.status} ${text}`);
    }
  }

  return {
    audienceId,
    stats: {
      totalMembers: opts.members.length,
      hashedRows: totalRows,
      batches: memberBatches.length,
      fields: buildMetaPayload(opts.members.slice(0, 1)).schema,
    },
  };
}
