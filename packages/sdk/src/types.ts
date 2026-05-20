// ─── Core types ────────────────────────────────────────────────────────────────

export interface ForgemsgClientOptions {
  /** API key (X-API-Key header). Required. */
  apiKey: string;
  /** Base URL of the ForgeMsg API. Defaults to https://api.forgemsg.io */
  baseUrl?: string;
  /** Maximum number of automatic retries on 429/5xx. Default: 3 */
  maxRetries?: number;
  /** Request timeout in milliseconds. Default: 30 000 */
  timeout?: number;
}

export interface ListResponse<T> {
  data: T[];
  cursor?: string;
  hasMore?: boolean;
  total?: number;
}

export interface ItemResponse<T> {
  data: T;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

// ─── Resource types ────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  orgId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  leadScore: number;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateContactInput extends Partial<CreateContactInput> {}

export interface List {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  sentAt?: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  createdAt: string;
}

export interface CustomEvent {
  id: string;
  eventName: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookSignatureVerifyOptions {
  secret: string;
  payload: string; // raw request body
  signature: string; // value of X-ForgeMsg-Signature header
}
