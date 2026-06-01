/**
 * Domains — Resend-shaped CRUD with dns_records array.
 */

import type { ForgemsgClient } from '../client.js';

export interface DomainRecord {
  record: 'SPF' | 'DKIM' | 'DMARC' | 'MX' | string;
  name: string;
  value: string;
  type: 'TXT' | 'CNAME' | 'MX';
  ttl: 'Auto' | number;
  priority?: number;
  status: 'pending' | 'verified' | 'failed';
}

export interface Domain {
  object: 'domain';
  id: string;
  name: string;
  status: 'pending' | 'verified';
  region: string;
  created_at: string;
  records: DomainRecord[];
}

export interface CreateDomainParams {
  name: string;
  region?: string;
}

export interface UpdateDomainParams {
  open_tracking?: boolean;
  click_tracking?: boolean;
}

export class DomainsResource {
  constructor(private readonly client: ForgemsgClient) {}

  list(): Promise<{ data: Domain[] }> {
    return this.client.get('/api/v1/domains/resend');
  }

  create(params: CreateDomainParams): Promise<Domain> {
    return this.client.post('/api/v1/domains/resend', params);
  }

  get(id: string): Promise<Domain> {
    return this.client.get(`/api/v1/domains/resend/${id}`);
  }

  update(id: string, params: UpdateDomainParams): Promise<Domain> {
    return this.client.patch<Domain>(`/api/v1/domains/resend/${id}`, params);
  }

  remove(id: string): Promise<{ object: 'domain'; id: string; deleted: boolean }> {
    return this.client.delete(`/api/v1/domains/resend/${id}`);
  }

  verify(id: string): Promise<Domain> {
    return this.client.post(`/api/v1/domains/resend/${id}/verify`);
  }
}
