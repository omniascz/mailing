/**
 * Broadcasts — Resend's "one-shot newsletter to an audience" surface,
 * mapped onto MailForge campaigns.
 */

import type { ForgemsgClient } from '../client.js';

export interface Broadcast {
  object: 'broadcast';
  id: string;
  audience_id: string | null;
  from: string | null;
  subject: string;
  reply_to: string[];
  preview_text: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
}

export interface CreateBroadcastParams {
  audience_id: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  name?: string;
  reply_to?: string | string[];
  preview_text?: string;
  scheduled_at?: string;
}

export interface UpdateBroadcastParams {
  subject?: string;
  from?: string;
  reply_to?: string | string[];
  preview_text?: string;
  html?: string;
  text?: string;
  scheduled_at?: string | null;
}

export interface SendBroadcastParams {
  scheduled_at?: string;
}

export class BroadcastsResource {
  constructor(private readonly client: ForgemsgClient) {}

  list(): Promise<{ data: Broadcast[] }> {
    return this.client.get('/api/v1/broadcasts');
  }

  create(params: CreateBroadcastParams): Promise<Broadcast> {
    return this.client.post('/api/v1/broadcasts', params);
  }

  get(id: string): Promise<Broadcast> {
    return this.client.get(`/api/v1/broadcasts/${id}`);
  }

  update(id: string, params: UpdateBroadcastParams): Promise<Broadcast> {
    return this.client.patch<Broadcast>(`/api/v1/broadcasts/${id}`, params);
  }

  remove(id: string): Promise<{ object: 'broadcast'; id: string; deleted: boolean }> {
    return this.client.delete(`/api/v1/broadcasts/${id}`);
  }

  send(id: string, params: SendBroadcastParams = {}): Promise<Broadcast> {
    return this.client.post(`/api/v1/broadcasts/${id}/send`, params);
  }
}
