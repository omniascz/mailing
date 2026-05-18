'use strict';
/**
 * Action: Create Contact
 */

module.exports = {
  key: 'create_contact',
  noun: 'Contact',
  display: {
    label: 'Create Contact',
    description: 'Creates a new contact in ForgeMsg.',
  },
  operation: {
    inputFields: [
      { key: 'email', label: 'Email', type: 'string', required: false },
      { key: 'firstName', label: 'First Name', type: 'string' },
      { key: 'lastName', label: 'Last Name', type: 'string' },
      { key: 'phone', label: 'Phone', type: 'string', helpText: 'E.164 format: +1234567890' },
    ],
    perform: async (z, bundle) => {
      const res = await z.request({
        url: `${process.env.BASE_URL}/api/v1/contacts`,
        method: 'POST',
        headers: { 'X-API-Key': bundle.authData.apiKey },
        body: {
          email: bundle.inputData.email,
          firstName: bundle.inputData.firstName,
          lastName: bundle.inputData.lastName,
          phone: bundle.inputData.phone,
        },
      });
      return res.data.data;
    },
    sample: {
      id: 'abc-123',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    },
  },
};
