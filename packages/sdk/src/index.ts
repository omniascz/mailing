/**
 * @forgemsg/sdk — Official ForgeMsg TypeScript/Node.js SDK
 *
 * @example
 * ```ts
 * import { ForgemsgClient } from '@forgemsg/sdk';
 *
 * const client = new ForgemsgClient({ apiKey: process.env.FORGEMSG_API_KEY });
 *
 * // Create a contact
 * const { data: contact } = await client.contacts.create({
 *   email: 'jane@example.com',
 *   firstName: 'Jane',
 * });
 *
 * // Track a custom event
 * await client.events.track({
 *   contactId: contact.id,
 *   eventName: 'purchase',
 *   properties: { amount: 49.99, currency: 'USD' },
 * });
 *
 * // Iterate all contacts
 * for await (const page of client.contacts.all()) {
 *   console.log(page.length, 'contacts');
 * }
 * ```
 */

export { ForgemsgClient, ForgemsgError } from './client.js';
export { verifyWebhookSignature } from './webhook.js';
export type {
  ForgemsgClientOptions,
  Contact,
  CreateContactInput,
  UpdateContactInput,
  List,
  Tag,
  Campaign,
  Workflow,
  CustomEvent,
  ListResponse,
  ItemResponse,
  PaginationOptions,
} from './types.js';

import { ForgemsgClient } from './client.js';
import { ContactsResource } from './resources/contacts.js';
import { EventsResource } from './resources/events.js';
import { EmailsResource } from './resources/emails.js';
import { AudiencesResource } from './resources/audiences.js';
import { BroadcastsResource } from './resources/broadcasts.js';
import { ApiKeysResource } from './resources/api-keys.js';
import { DomainsResource } from './resources/domains.js';

export type {
  SendEmailParams,
  SendEmailResult,
  EmailDetail,
  EmailTag,
  EmailAttachment,
  EmailRecipient,
  BatchSendResult,
  SendOptions,
} from './resources/emails.js';
export type {
  Audience,
  AudienceContact,
  CreateAudienceParams,
  CreateContactParams,
  UpdateContactParams,
} from './resources/audiences.js';
export type {
  Broadcast,
  CreateBroadcastParams,
  UpdateBroadcastParams,
  SendBroadcastParams,
} from './resources/broadcasts.js';
export type { ApiKey, CreateApiKeyParams } from './resources/api-keys.js';
export type {
  Domain,
  DomainRecord,
  CreateDomainParams,
  UpdateDomainParams,
} from './resources/domains.js';

// ─── Augment ForgemsgClient with resource namespaces ──────────────────────────

declare module './client.js' {
  interface ForgemsgClient {
    readonly contacts: ContactsResource;
    readonly events: EventsResource;
    readonly emails: EmailsResource;
    readonly audiences: AudiencesResource;
    readonly broadcasts: BroadcastsResource;
    readonly apiKeys: ApiKeysResource;
    readonly domains: DomainsResource;
  }
}

// Patch resource accessors onto the prototype
const proto = ForgemsgClient.prototype as unknown as Record<string, unknown>;

Object.defineProperty(proto, 'contacts', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_contacts'] ??= new ContactsResource(
      this,
    ));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'events', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_events'] ??= new EventsResource(this));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'emails', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_emails'] ??= new EmailsResource(this));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'audiences', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_audiences'] ??= new AudiencesResource(
      this,
    ));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'broadcasts', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_broadcasts'] ??= new BroadcastsResource(
      this,
    ));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'apiKeys', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_apiKeys'] ??= new ApiKeysResource(this));
  },
  enumerable: true,
});

Object.defineProperty(proto, 'domains', {
  get(this: ForgemsgClient) {
    return ((this as unknown as Record<string, unknown>)['_domains'] ??= new DomainsResource(this));
  },
  enumerable: true,
});
