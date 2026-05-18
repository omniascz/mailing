import type { ForgemsgClient } from '../client.js';
import type { CustomEvent, ItemResponse } from '../types.js';

export class EventsResource {
  constructor(private readonly client: ForgemsgClient) {}

  /** Track a custom event for a contact (triggers api_event workflows). */
  track(params: {
    contactId?: string;
    contactEmail?: string;
    eventName: string;
    properties?: Record<string, unknown>;
  }): Promise<ItemResponse<CustomEvent>> {
    return this.client.post<ItemResponse<CustomEvent>>('/api/v1/events', params);
  }

  list(params?: { contactId?: string; limit?: number }): Promise<{ data: CustomEvent[] }> {
    const qs = new URLSearchParams();
    if (params?.contactId) qs.set('contactId', params.contactId);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return this.client.get(`/api/v1/events${q ? `?${q}` : ''}`);
  }
}
