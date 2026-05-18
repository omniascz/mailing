'use strict';
/**
 * Trigger: Email Opened
 * Fires when a contact opens an email.
 */

const subscribeHook = async (z, bundle) => {
  const res = await z.request({
    url: `${process.env.BASE_URL}/api/v1/webhooks`,
    method: 'POST',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    body: {
      url: bundle.targetUrl,
      events: ['email.opened'],
      description: 'Zapier: Email Opened trigger',
    },
  });
  return res.data;
};

const unsubscribeHook = async (z, bundle) => {
  await z.request({
    url: `${process.env.BASE_URL}/api/v1/webhooks/${bundle.subscribeData.id}`,
    method: 'DELETE',
    headers: { 'X-API-Key': bundle.authData.apiKey },
  });
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
    performList: async (z, bundle) => [],
    sample: {
      contactId: 'abc-123',
      email: 'jane@example.com',
      campaignId: 'camp-456',
      openedAt: new Date().toISOString(),
    },
  },
};
