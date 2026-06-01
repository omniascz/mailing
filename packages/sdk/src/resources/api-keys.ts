/**
 * API Keys — Resend-shaped CRUD.
 */

import type { ForgemsgClient } from '../client.js';

export interface ApiKey {
  object: 'api_key';
  id: string;
  name: string;
  created_at: string;
  token?: string;
}

export interface CreateApiKeyParams {
  name: string;
  permission?: 'full_access' | 'sending_access';
  /** When 'test', the key never queues real sends (sandbox / CI mode). */
  mode?: 'live' | 'test';
}

export class ApiKeysResource {
  constructor(private readonly client: ForgemsgClient) {}

  list(): Promise<{ data: ApiKey[] }> {
    return this.client.get('/api/v1/api-keys/resend');
  }

  /** Returns the raw token exactly once — store it immediately. */
  create(params: CreateApiKeyParams): Promise<ApiKey & { token: string }> {
    return this.client.post('/api/v1/api-keys/resend', params);
  }

  remove(id: string): Promise<{ object: 'api_key'; id: string; deleted: boolean }> {
    return this.client.delete(`/api/v1/api-keys/resend/${id}`);
  }
}
