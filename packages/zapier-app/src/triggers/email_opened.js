'use strict';
/**
 * Trigger: Email Opened
 *
 * A REST hook on email.opened, which fires when the tracking pixel in a sent
 * email is loaded. Open tracking is best-effort by nature: clients that block
 * images never fire it, and prefetchers can fire it without a human reading
 * anything.
 */

const subscribeHook = async (z, bundle) => {
  const res = await z.request({
    url: '{{process.env.BASE_URL}}/api/v1/webhooks',
    method: 'POST',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    body: {
      url: bundle.targetUrl,
      events: ['email.opened'],
      description: 'Zapier: Email Opened trigger',
    },
  });
  // res.data.data, not res.data — the API wraps in { data: … }. See the
  // matching comment in new_subscriber.js.
  return res.data.data;
};

const unsubscribeHook = async (z, bundle) => {
  await z.request({
    url: `{{process.env.BASE_URL}}/api/v1/webhooks/${bundle.subscribeData.id}`,
    method: 'DELETE',
    headers: { 'X-API-Key': bundle.authData.apiKey },
  });
};

/**
 * Sample data for the Zap editor.
 *
 * This returned a hard-coded [] before, which Zapier will not accept for
 * publication — the editor has nothing to show and field mapping cannot be
 * set up. Real opens come from the email events feed, filtered to opens, and
 * reshaped into the webhook payload so what a user maps is what they get.
 */
const getRecentOpens = async (z, bundle) => {
  // The managed event stream is the right source: it stores exactly the
  // payloads the webhook delivers, so a sample from here cannot drift from
  // what the trigger will actually send. Every org has one whether or not any
  // webhook is configured.
  const res = await z.request({
    url: '{{process.env.BASE_URL}}/api/v1/events/stream',
    method: 'GET',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    params: { limit: 100 },
  });
  return (res.data.data ?? [])
    .filter((e) => e.event === 'email.opened')
    .slice(-3)
    .map((e) => ({
      // Zapier de-duplicates on `id`; the stream entry id is stable and unique.
      id: e.id,
      ...(e.data ?? {}),
    }));
};

module.exports = {
  key: 'email_opened',
  noun: 'Email Open',
  display: {
    label: 'Email Opened',
    description: 'Triggers when a contact opens an email.',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform: (z, bundle) => [bundle.cleanedRequest.data ?? bundle.cleanedRequest],
    performList: getRecentOpens,
    // Matches the email.opened payload. It used to promise an `openedAt` that
    // the payload has never carried — the event time is on the envelope, not
    // in `data`, so a Zap mapping openedAt got nothing.
    sample: {
      messageId: '01JABCDEF0123456789',
      contactId: 'abc-123',
      campaignId: 'camp-456',
      email: 'jane@example.com',
    },
    outputFields: [
      { key: 'messageId', label: 'Message ID' },
      { key: 'contactId', label: 'Contact ID' },
      { key: 'campaignId', label: 'Campaign ID' },
      { key: 'email', label: 'Email' },
    ],
  },
};
