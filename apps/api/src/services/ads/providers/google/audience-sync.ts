/**
 * Google Ads Customer Match uploader.
 *
 * Four-step flow per Google docs:
 *   1. POST /customers/{cid}/userLists           ensure userList exists
 *   2. POST /customers/{cid}/offlineUserDataJobs:create
 *   3. POST /offlineUserDataJobs/{id}:addOperations  per batch
 *   4. POST /offlineUserDataJobs/{id}:run        kick off processing
 *
 * GOOGLE_ADS_DEVELOPER_TOKEN env var required at runtime; the OAuth
 * access token is per-org and stored on adAccounts.accessToken.
 *
 * Spec: https://developers.google.com/google-ads/api/reference/rpc/v16/OfflineUserDataJob
 */

import {
  buildGoogleOperations,
  chunkGoogle,
  type GoogleAudienceMember,
  type GoogleSyncStats,
} from './pure.js';

const GOOGLE_API_BASE = 'https://googleads.googleapis.com/v16';

export interface GoogleUploadOptions {
  accessToken: string;
  developerToken: string;
  customerId: string;
  audienceName: string;
  members: GoogleAudienceMember[];
  /** Optional override for the existing userList. When unset, we create one. */
  userListResourceName?: string;
  fetchImpl?: typeof globalThis.fetch;
  apiBase?: string;
}

export interface GoogleUploadResult {
  /** resourceName of the matched/created userList. */
  userListResourceName: string;
  /** resourceName of the OfflineUserDataJob that ran. */
  jobResourceName: string;
  stats: GoogleSyncStats;
}

interface GoogleErrorBody {
  error?: { message?: string; status?: string };
}

async function jsonOrThrow<T>(res: Response, where: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GoogleErrorBody;
    const reason = body.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Google Ads ${where} failed: ${reason}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadToGoogle(opts: GoogleUploadOptions): Promise<GoogleUploadResult> {
  if (!opts.accessToken) throw new Error('Google Ads access token is required');
  if (!opts.developerToken) throw new Error('Google Ads developer token is required');
  if (!opts.customerId) throw new Error('Google Ads customer id is required');
  if (!opts.audienceName.trim()) throw new Error('Google Ads audience name is required');

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.apiBase ?? GOOGLE_API_BASE;
  const cid = opts.customerId;

  const headers = {
    authorization: `Bearer ${opts.accessToken}`,
    'developer-token': opts.developerToken,
    'content-type': 'application/json',
  };

  // 1. User list — either reuse what the caller passed or create.
  let userList = opts.userListResourceName;
  if (!userList) {
    const created = await jsonOrThrow<{ results?: Array<{ resourceName?: string }> }>(
      await fetchImpl(`${base}/customers/${cid}/userLists:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: opts.audienceName,
                description: 'MailForge CRM audience sync',
                crmBasedUserList: { uploadKeyType: 'CONTACT_INFO' },
                membershipLifeSpan: 540, // max allowed
              },
            },
          ],
        }),
      }),
      'userList create',
    );
    userList = created.results?.[0]?.resourceName;
    if (!userList) throw new Error('Google Ads userList create: missing resourceName');
  }

  // 2. Offline user data job → create.
  const jobCreated = await jsonOrThrow<{ resourceName?: string }>(
    await fetchImpl(`${base}/customers/${cid}/offlineUserDataJobs:create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        job: {
          type: 'CUSTOMER_MATCH_USER_LIST',
          customerMatchUserListMetadata: { userList },
        },
      }),
    }),
    'offlineUserDataJob create',
  );
  const jobResourceName = jobCreated.resourceName;
  if (!jobResourceName) throw new Error('Google Ads job create: missing resourceName');

  // 3. addOperations per batch.
  const operations = buildGoogleOperations(opts.members);
  const batches = chunkGoogle(operations);
  for (let i = 0; i < batches.length; i++) {
    const ops = batches[i]!;
    const res = await fetchImpl(`${base}/${jobResourceName}:addOperations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operations: ops,
        enablePartialFailure: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Google Ads addOperations failed (batch ${i}): HTTP ${res.status} ${text}`,
      );
    }
  }

  // 4. Run.
  await jsonOrThrow<unknown>(
    await fetchImpl(`${base}/${jobResourceName}:run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    }),
    'offlineUserDataJob run',
  );

  return {
    userListResourceName: userList,
    jobResourceName,
    stats: {
      totalMembers: opts.members.length,
      operations: operations.length,
      batches: batches.length,
    },
  };
}
