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

// ─── Augment ForgemsgClient with resource namespaces ──────────────────────────

declare module './client.js' {
  interface ForgemsgClient {
    readonly contacts: ContactsResource;
    readonly events: EventsResource;
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
