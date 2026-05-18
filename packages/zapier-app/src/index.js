'use strict';

const { version } = require('../package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const newSubscriber = require('./triggers/new_subscriber');
const emailOpened = require('./triggers/email_opened');
const createContact = require('./creates/create_contact');
const addTag = require('./creates/add_tag');
const triggerWorkflow = require('./creates/trigger_workflow');

module.exports = {
  version,
  platformVersion,

  authentication,

  beforeRequest: [
    // Inject API key from auth data into every request (fallback in case auth header is missing)
    (request, z, bundle) => {
      if (!request.headers['X-API-Key'] && bundle.authData.apiKey) {
        request.headers['X-API-Key'] = bundle.authData.apiKey;
      }
      return request;
    },
  ],

  afterResponse: [
    // Surface API errors with detail
    (response, z) => {
      if (response.status >= 400) {
        let detail;
        try {
          detail = JSON.parse(response.content);
        } catch {
          detail = { message: response.content };
        }
        throw new z.errors.Error(
          detail.message ?? `HTTP ${response.status}`,
          detail.code ?? 'API_ERROR',
          response.status,
        );
      }
      return response;
    },
  ],

  triggers: {
    [newSubscriber.key]: newSubscriber,
    [emailOpened.key]: emailOpened,
  },

  creates: {
    [createContact.key]: createContact,
    [addTag.key]: addTag,
    [triggerWorkflow.key]: triggerWorkflow,
  },
};
