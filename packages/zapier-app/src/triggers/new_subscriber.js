'use strict';
/**
 * Trigger: New Subscriber
 *
 * A REST hook on contact.created. Note what that does and does not cover:
 * contacts created one at a time (the API, this app's own Create Contact
 * action, signup forms, SMS keywords, the inbox, ticketing, lead ads, Calendly,
 * CDP identity resolution) all fire. Bulk imports deliberately do not — see
 * docs/webhooks/events.md — so a Zap on this trigger will not see a CSV upload.
 */

const subscribeHook = async (z, bundle) => {
  const res = await z.request({
    url: '{{process.env.BASE_URL}}/api/v1/webhooks',
    method: 'POST',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    body: {
      url: bundle.targetUrl,
      events: ['contact.created'],
      description: 'Zapier: New Subscriber trigger',
    },
  });
  // The API wraps everything in { data: … }, so the webhook id is at
  // res.data.data.id. This used to return res.data, whose `id` was undefined —
  // which meant performUnsubscribe below deleted /api/v1/webhooks/undefined,
  // got a 400, and left the webhook running after the Zap was turned off.
  return res.data.data;
};

const unsubscribeHook = async (z, bundle) => {
  await z.request({
    url: `{{process.env.BASE_URL}}/api/v1/webhooks/${bundle.subscribeData.id}`,
    method: 'DELETE',
    headers: { 'X-API-Key': bundle.authData.apiKey },
  });
};

/** Sample data for the Zap editor, from real contacts. */
const getContacts = async (z, bundle) => {
  const res = await z.request({
    url: '{{process.env.BASE_URL}}/api/v1/contacts',
    method: 'GET',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    params: { limit: 3 },
  });
  // Shaped like the webhook payload, not like the contacts API row, so the
  // fields a user maps from a sample are the fields the trigger will deliver.
  return (res.data.data ?? []).map((c) => ({
    id: c.id,
    email: c.email ?? null,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    phone: c.phone ?? null,
    status: c.status ?? 'active',
    createdAt: c.createdAt,
    source: 'api',
  }));
};

const processWebhookPayload = (z, bundle) => {
  return [bundle.cleanedRequest.data ?? bundle.cleanedRequest];
};

module.exports = {
  key: 'new_subscriber',
  noun: 'Subscriber',
  display: {
    label: 'New Subscriber',
    description:
      'Triggers when a contact is created in ForgeMsg. Bulk imports do not fire this trigger.',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform: processWebhookPayload,
    performList: getContacts,
    // Matches the contact.created payload exactly — see
    // apps/api/src/services/webhooks/payloads.ts. It used to promise
    // { id, email, firstName, lastName, createdAt } while the API sent
    // { contactId, formId, email }, so every field a user mapped came out empty.
    sample: {
      id: 'abc-123',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: null,
      status: 'active',
      createdAt: '2026-08-05T09:41:11.882Z',
      source: 'signup_form',
    },
    outputFields: [
      { key: 'id', label: 'Contact ID' },
      { key: 'email', label: 'Email' },
      { key: 'firstName', label: 'First Name' },
      { key: 'lastName', label: 'Last Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created At' },
      { key: 'source', label: 'Source', helpText: 'Which path created the contact.' },
    ],
  },
};
