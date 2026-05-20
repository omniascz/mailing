import type { ForgemsgClient } from '../client.js';
import type {
  Contact,
  CreateContactInput,
  UpdateContactInput,
  ListResponse,
  ItemResponse,
  PaginationOptions,
} from '../types.js';

export class ContactsResource {
  constructor(private readonly client: ForgemsgClient) {}

  list(opts?: PaginationOptions & { search?: string }): Promise<ListResponse<Contact>> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.search) params.set('search', opts.search);
    const qs = params.toString();
    return this.client.get<ListResponse<Contact>>(`/api/v1/contacts${qs ? `?${qs}` : ''}`);
  }

  get(id: string): Promise<ItemResponse<Contact>> {
    return this.client.get<ItemResponse<Contact>>(`/api/v1/contacts/${id}`);
  }

  create(data: CreateContactInput): Promise<ItemResponse<Contact>> {
    return this.client.post<ItemResponse<Contact>>('/api/v1/contacts', data);
  }

  update(id: string, data: UpdateContactInput): Promise<ItemResponse<Contact>> {
    return this.client.put<ItemResponse<Contact>>(`/api/v1/contacts/${id}`, data);
  }

  delete(id: string): Promise<void> {
    return this.client.delete<void>(`/api/v1/contacts/${id}`);
  }

  /** Bulk create contacts. Returns { imported, skipped, errors }. */
  bulkCreate(
    contacts: CreateContactInput[],
  ): Promise<{ data: { imported: number; skipped: number; errors: string[] } }> {
    return this.client.post('/api/v1/contacts/bulk', { contacts });
  }

  addTag(id: string, tagName: string): Promise<void> {
    return this.client.post<void>(`/api/v1/contacts/${id}/tags`, { tagName });
  }

  removeTag(id: string, tagName: string): Promise<void> {
    return this.client.delete<void>(`/api/v1/contacts/${id}/tags/${encodeURIComponent(tagName)}`);
  }

  /** Iterate all contacts across pages. */
  async *all(pageSize = 100) {
    yield* this.client.paginate<Contact>('/api/v1/contacts', pageSize);
  }
}
