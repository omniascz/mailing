/**
 * TikTok Business Custom Audience uploader.
 *
 * Two-step flow:
 *   1. POST /dmp/custom_audience/create/    create with first batch
 *   2. POST /dmp/custom_audience/update/    append additional batches
 *
 * Auth: `Access-Token` header (long-lived access token tied to the
 * advertiser_id). Hashing lives in `./pure.ts`.
 *
 * Spec: https://business-api.tiktok.com/portal/docs?id=1740058709041666
 */

import {
  buildTikTokRows,
  chunkTikTok,
  validateTikTokAudienceName,
  type TikTokAudienceMember,
  type TikTokSyncStats,
} from './pure.js';

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export interface TikTokUploadOptions {
  accessToken: string;
  advertiserId: string;
  audienceName: string;
  members: TikTokAudienceMember[];
  fetchImpl?: typeof globalThis.fetch;
  apiBase?: string;
}

export interface TikTokUploadResult {
  customAudienceId: string;
  stats: TikTokSyncStats;
}

interface TikTokCreateResponse {
  code?: number;
  message?: string;
  data?: { custom_audience_id?: string };
}

export async function uploadToTikTok(opts: TikTokUploadOptions): Promise<TikTokUploadResult> {
  if (!opts.accessToken) throw new Error('TikTok access token is required');
  if (!opts.advertiserId) throw new Error('TikTok advertiser id is required');
  const audienceName = validateTikTokAudienceName(opts.audienceName);

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.apiBase ?? TIKTOK_API_BASE;
  const headers = {
    'access-token': opts.accessToken,
    'content-type': 'application/json',
  };

  const allRows = buildTikTokRows(opts.members);
  if (allRows.length === 0) {
    throw new Error('Cannot create a TikTok audience with zero valid rows');
  }
  const batches = chunkTikTok(allRows);

  // 1. Create with the first batch.
  const firstBody = {
    advertiser_id: opts.advertiserId,
    custom_audience_name: audienceName,
    audience_sub_type: 'NORMAL',
    data: batches[0]!,
  };
  const createRes = await fetchImpl(`${base}/dmp/custom_audience/create/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(firstBody),
  });
  const createJson = (await createRes.json()) as TikTokCreateResponse;
  if (!createRes.ok || createJson.code !== 0 || !createJson.data?.custom_audience_id) {
    const reason = createJson.message ?? `HTTP ${createRes.status}`;
    throw new Error(`TikTok audience create failed: ${reason}`);
  }
  const customAudienceId = createJson.data.custom_audience_id;

  // 2. Append the rest.
  for (let i = 1; i < batches.length; i++) {
    const body = {
      advertiser_id: opts.advertiserId,
      custom_audience_id: customAudienceId,
      action: 'ADD',
      data: batches[i]!,
    };
    const res = await fetchImpl(`${base}/dmp/custom_audience/update/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as TikTokCreateResponse;
    if (!res.ok || json.code !== 0) {
      throw new Error(
        `TikTok audience append (batch ${i}) failed: ${json.message ?? `HTTP ${res.status}`}`,
      );
    }
  }

  return {
    customAudienceId,
    stats: {
      totalMembers: opts.members.length,
      hashedRows: allRows.length,
      batches: batches.length,
    },
  };
}
