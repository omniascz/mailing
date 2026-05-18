'use strict';

/**
 * API key authentication for the ForgeMsg Zapier app.
 * Users paste their ForgeMsg API key (from Settings → API Keys).
 */

const authentication = {
  type: 'custom',

  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      required: true,
      type: 'string',
      helpText: 'Your ForgeMsg API key. Create one at Settings → API Keys.',
    },
  ],

  test: {
    url: '{{process.env.BASE_URL}}/api/v1/contacts',
    method: 'GET',
    params: { limit: '1' },
    headers: { 'X-API-Key': '{{bundle.authData.apiKey}}' },
    removeMissingValuesFrom: {},
    curlOptions: {},
    body: {},
  },

  connectionLabel: (z, bundle) => {
    return `ForgeMsg (${bundle.authData.apiKey.slice(0, 12)}...)`;
  },
};

module.exports = authentication;
