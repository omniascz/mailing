'use strict';
/**
 * Action: Add Tag to Contact
 */

module.exports = {
  key: 'add_tag',
  noun: 'Tag',
  display: {
    label: 'Add Tag',
    description: 'Adds a tag to an existing ForgeMsg contact.',
  },
  operation: {
    inputFields: [
      { key: 'contactId', label: 'Contact ID', type: 'string', required: true },
      { key: 'tagName', label: 'Tag Name', type: 'string', required: true },
    ],
    perform: async (z, bundle) => {
      await z.request({
        url: `${process.env.BASE_URL}/api/v1/contacts/${bundle.inputData.contactId}/tags`,
        method: 'POST',
        headers: { 'X-API-Key': bundle.authData.apiKey },
        body: { tagName: bundle.inputData.tagName },
      });
      return {
        success: true,
        contactId: bundle.inputData.contactId,
        tagName: bundle.inputData.tagName,
      };
    },
    sample: { success: true, contactId: 'abc-123', tagName: 'vip' },
  },
};
