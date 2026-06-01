/**
 * Audiences + contacts inside audiences. Resend-compatible surface
 * mapped onto MailForge lists.
 */

import type { ForgemsgClient } from '../client.js';

export interface Audience {
  object: 'audience';
  id: string;
  name: string;
  created_at: string;
}

export interface AudienceContact {
  object: 'contact';
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  unsubscribed: boolean;
}

export interface CreateAudienceParams {
  name: string;
}

export interface CreateContactParams {
  email: string;
  first_name?: string;
  last_name?: string;
  unsubscribed?: boolean;
}

export interface UpdateContactParams {
  first_name?: string;
  last_name?: string;
  unsubscribed?: boolean;
}

class AudienceContactsResource {
  constructor(private readonly client: ForgemsgClient, private readonly audienceId: string) {}

  list(): Promise<{ data: AudienceContact[] }> {
    return this.client.get(`/api/v1/audiences/${this.audienceId}/contacts`);
  }

  create(params: CreateContactParams): Promise<AudienceContact> {
    return this.client.post(`/api/v1/audiences/${this.audienceId}/contacts`, params);
  }

  get(id: string): Promise<AudienceContact> {
    return this.client.get(`/api/v1/audiences/${this.audienceId}/contacts/${id}`);
  }

  update(id: string, params: UpdateContactParams): Promise<AudienceContact> {
    return this.client.patch<AudienceContact>(
      `/api/v1/audiences/${this.audienceId}/contacts/${id}`,
      params,
    );
  }

  remove(id: string): Promise<{ object: 'contact'; id: string; deleted: boolean }> {
    return this.client.delete(`/api/v1/audiences/${this.audienceId}/contacts/${id}`);
  }
}

export class AudiencesResource {
  constructor(private readonly client: ForgemsgClient) {}

  list(): Promise<{ data: Audience[] }> {
    return this.client.get('/api/v1/audiences');
  }

  create(params: CreateAudienceParams): Promise<Audience> {
    return this.client.post('/api/v1/audiences', params);
  }

  get(id: string): Promise<Audience> {
    return this.client.get(`/api/v1/audiences/${id}`);
  }

  remove(id: string): Promise<{ object: 'audience'; id: string; deleted: boolean }> {
    return this.client.delete(`/api/v1/audiences/${id}`);
  }

  /** Scoped contacts namespace: `client.audiences.contacts('audId').create(…)`. */
  contacts(audienceId: string): AudienceContactsResource {
    return new AudienceContactsResource(this.client, audienceId);
  }
}
