'use strict';
/**
 * Action: Trigger Workflow
 */

module.exports = {
  key: 'trigger_workflow',
  noun: 'Workflow Run',
  display: {
    label: 'Trigger Workflow',
    description: 'Manually triggers a ForgeMsg workflow for a contact.',
  },
  operation: {
    inputFields: [
      {
        key: 'workflowId',
        label: 'Workflow',
        type: 'string',
        required: true,
        dynamic: 'workflow_list.id.name',
        helpText: 'Select a workflow or paste its ID.',
      },
      { key: 'contactId', label: 'Contact ID', type: 'string', required: true },
    ],
    perform: async (z, bundle) => {
      const res = await z.request({
        url: `{{process.env.BASE_URL}}/api/v1/workflows/${bundle.inputData.workflowId}/trigger`,
        method: 'POST',
        headers: { 'X-API-Key': bundle.authData.apiKey },
        body: { contactId: bundle.inputData.contactId },
      });
      return res.data.data ?? res.data;
    },
    sample: { id: 'run-123', status: 'pending', workflowId: 'wf-456', contactId: 'c-789' },
  },
};
