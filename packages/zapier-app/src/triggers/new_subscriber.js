'use strict';
/**
 * Trigger: New Subscriber
 * Fires when a contact is added to a list.
 */

const subscribeHook = async (z, bundle) => {
  const data = {
    url: bundle.targetUrl,
    events: ['contact.created'],
    description: 'Zapier: New Subscriber trigger',
  };
  const res = await z.request({
    url: `${process.env.BASE_URL}/api/v1/webhooks`,
    method: 'POST',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    body: data,
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

const getContacts = async (z, bundle) => {
  const res = await z.request({
    url: `${process.env.BASE_URL}/api/v1/contacts`,
    method: 'GET',
    headers: { 'X-API-Key': bundle.authData.apiKey },
    params: { limit: 3 },
  });
  return res.data.data ?? [];
};

const processWebhookPayload = (z, bundle) => {
  return [bundle.cleanedRequest.data ?? bundle.cleanedRequest];
};

module.exports = {
  key: 'new_subscriber',
  noun: 'Subscriber',
  display: {
    label: 'New Subscriber',
    description: 'Triggers when a new contact is created in ForgeMsg.',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform: processWebhookPayload,
    performList: getContacts,
    sample: {
      id: 'abc-123',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      createdAt: new Date().toISOString(),
    },
  },
};
