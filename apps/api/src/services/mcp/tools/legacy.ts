/**
 * The six tools that shipped with the MCP server, moved onto the registry.
 *
 * They are ported rather than rewritten: this PR's job is the structure and one
 * area, and quietly changing what `send_email` does while moving it would hide
 * a behaviour change inside a refactor. What DID change is that they now work
 * at all — the server authenticated with `Authorization: Bearer <api key>`,
 * which the API reads as a JWT session token, so every one of them answered
 * 401. Measured:
 *
 *   Authorization: Bearer fm_live_…   ->  401
 *   X-API-Key: fm_live_…              ->  200
 *
 * The transport now sends `X-API-Key`, and `X-Org-Id` is gone: no route outside
 * the FBL webhook reads it, and a header that names the tenant is the shape
 * #123 and #131 were about. The org comes from the key.
 */

import { z } from 'zod';
import { defineTool, expectOk } from '../registry.js';

export const sendEmail = defineTool({
  name: 'send_email',
  description: 'Send a transactional email to one recipient.',
  input: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    html: z.string().describe('Email HTML body'),
    text: z.string().optional().describe('Plain-text alternative'),
    from_name: z.string().optional().describe('Sender display name'),
  }),
  async run(input, ctx) {
    await expectOk(ctx, '/api/v1/transactional/email', 'POST', {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      fromName: input.from_name,
    });
    return `Email sent to ${input.to}.`;
  },
});

export const sendSms = defineTool({
  name: 'send_sms',
  description: 'Send a transactional SMS to one recipient.',
  input: z.object({
    to: z.string().describe('Recipient phone number in E.164 form'),
    body: z.string().describe('Message text'),
    sender_id: z.string().optional().describe('Sender id, where the country allows one'),
  }),
  async run(input, ctx) {
    await expectOk(ctx, '/api/v1/transactional/sms', 'POST', {
      to: input.to,
      body: input.body,
      senderId: input.sender_id,
    });
    return `SMS sent to ${input.to}.`;
  },
});

export const createContact = defineTool({
  name: 'create_contact',
  description: 'Create a contact, or update the one that already has this email address.',
  input: z.object({
    email: z.string().describe('Email address'),
    first_name: z.string().optional().describe('First name'),
    last_name: z.string().optional().describe('Last name'),
    phone: z.string().optional().describe('Phone number in E.164 form'),
    tags: z.array(z.string()).optional().describe('Tags to attach'),
  }),
  async run(input, ctx) {
    const body = (await expectOk(ctx, '/api/v1/contacts', 'POST', {
      email: input.email,
      firstName: input.first_name,
      lastName: input.last_name,
      phone: input.phone,
      tags: input.tags ?? [],
    })) as { data?: { id?: string } };
    return `Contact ${input.email} saved${body.data?.id ? ` (id ${body.data.id})` : ''}.`;
  },
});

export const querySegments = defineTool({
  name: 'query_segments',
  description: 'List segments in this account, optionally filtered by a fragment of the name.',
  input: z.object({
    name_contains: z.string().optional().describe('Case-insensitive fragment of the segment name'),
    limit: z.number().optional().describe('How many to return (default 10)'),
  }),
  async run(input, ctx) {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const body = (await expectOk(ctx, `/api/v1/segments?limit=${limit}`)) as {
      data?: Array<{ id: string; name: string }>;
    };
    let rows = body.data ?? [];
    if (input.name_contains) {
      const needle = input.name_contains.toLowerCase();
      rows = rows.filter((s) => s.name.toLowerCase().includes(needle));
    }
    if (rows.length === 0) return 'No segments in this account match.';
    return `${rows.length} segment(s):\n${rows.map((s) => `- ${s.name} (id ${s.id})`).join('\n')}`;
  },
});

export const getCampaign = defineTool({
  name: 'get_campaign',
  description: 'Read one campaign by id — its name, subject, status and schedule.',
  input: z.object({
    campaign_id: z.string().describe('Campaign UUID'),
  }),
  async run(input, ctx) {
    const body = (await expectOk(ctx, `/api/v1/campaigns/${input.campaign_id}`)) as {
      data?: Record<string, unknown>;
    };
    return JSON.stringify(body.data ?? {}, null, 2);
  },
});

export const createCampaign = defineTool({
  name: 'create_campaign',
  description: 'Create a draft email campaign. It is not sent — sending stays a human action.',
  input: z.object({
    name: z.string().describe('Internal campaign name'),
    subject: z.string().describe('Subject line'),
    from_name: z.string().describe('Sender display name'),
    from_email: z.string().describe('Sender address, on a verified domain'),
    html: z.string().optional().describe('Email HTML body'),
    segment_id: z.string().optional().describe('Segment UUID to send to'),
  }),
  async run(input, ctx) {
    const body = (await expectOk(ctx, '/api/v1/campaigns', 'POST', {
      name: input.name,
      subject: input.subject,
      fromName: input.from_name,
      fromEmail: input.from_email,
      type: 'email',
      content: { html: input.html ?? '' },
      segmentId: input.segment_id,
    })) as { data?: { id?: string } };
    return `Draft campaign "${input.name}" created${body.data?.id ? ` (id ${body.data.id})` : ''}. It has not been sent.`;
  },
});

export const legacyTools = [
  sendEmail,
  sendSms,
  createContact,
  querySegments,
  getCampaign,
  createCampaign,
];
