/**
 * Thin API client for the ForgeMsg mobile app.
 * Sends the stored API key as `x-api-key` and unwraps the `{ data }` envelope.
 */

import { loadCredentials, type Credentials } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, creds?: Credentials): Promise<T> {
  const c = creds ?? (await loadCredentials());
  if (!c) throw new ApiError(401, 'Not authenticated');
  const url = `${c.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.apiKey,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text.slice(0, 200) || `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** Validate credentials by calling the Zapier auth-test endpoint. */
export async function verifyCredentials(creds: Credentials): Promise<boolean> {
  try {
    await request('/api/v1/zapier/me', {}, creds);
    return true;
  } catch {
    return false;
  }
}

export interface Contact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  sentAt: string | null;
}

export interface CampaignStats {
  openRate: number;
  clickRate: number;
  ctor: number;
  bounceRate: number;
  unsubRate: number;
}

export const api = {
  listContacts: (limit = 50) =>
    request<{ data?: Contact[] } | Contact[]>(`/api/v1/contacts?limit=${limit}`).then((r) =>
      Array.isArray(r) ? r : ((r as { data?: Contact[] }).data ?? []),
    ),
  listCampaigns: () =>
    request<{ data?: Campaign[] } | Campaign[]>(`/api/v1/campaigns?limit=50`).then((r) =>
      Array.isArray(r) ? r : ((r as { data?: Campaign[] }).data ?? []),
    ),
  getCampaign: (id: string) => request<Campaign>(`/api/v1/campaigns/${id}`),
  getCampaignStats: (id: string) => request<CampaignStats>(`/api/v1/campaigns/${id}/stats`),
};

export { request };
