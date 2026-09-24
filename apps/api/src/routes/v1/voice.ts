/**
 * Voice call routes (task 8.17).
 *
 * POST /voice/calls/initiate           — initiate outbound call
 * GET  /voice/calls/:id                — get call details
 * GET  /voice/calls/contact/:id        — list calls for contact
 * GET  /voice/campaigns/:id/calls      — list calls for campaign
 * GET  /voice/campaigns/:id/stats      — campaign call statistics
 * POST /voice/callback                 — Twilio webhook callback (recording, status)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getCall,
  getCallsByContact,
  getCallsByCampaign,
  getCallStats,
  queueOutboundCall,
  completeCall,
  type OutboundCallRequest,
} from '../../services/voice/call-manager.js';
import { AppError } from '../../lib/app-error.js';
import { twilioSignatureRefusal } from '../../lib/twilio-signature.js';

export default async function voiceRoutes(app: FastifyInstance) {
  // ─── Initiate outbound call ──────────────────────────────────────────────

  /**
   * The `req.user!` below is what makes this guard load-bearing rather than
   * decorative. plugins/auth.ts POPULATES `request.user` in an onRequest hook
   * and never enforces it — enforcement is `app.authenticate`, per route — so
   * without this preHandler an anonymous POST reached the handler and the
   * non-null assertion threw: measured 500, not 401.
   *
   * It did not place a call. `req.user!.orgId` is the first statement, so it
   * throws before queueOutboundCall, and the call row is written inside that
   * function (services/voice/call-manager.ts:245). Measured before this change:
   * anonymous POST → 500 and `calls` unchanged. The hole was a crash and a
   * wrong status code on a route that dials phone numbers — not a free call,
   * and now neither.
   */
  app.post(
    '/api/v1/voice/calls/initiate',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Voice'], summary: 'Initiate outbound call' },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      const { contactId, phone, campaignId, scenarioId, context } = z
        .object({
          contactId: z.string().uuid(),
          phone: z.string().min(7).max(20),
          campaignId: z.string().uuid().optional(),
          scenarioId: z.string().uuid().optional(),
          context: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      const request: OutboundCallRequest = {
        orgId,
        contactId,
        phone,
        campaignId,
        scenarioId,
        context,
      };

      try {
        const callId = await queueOutboundCall(request);
        if (!callId) {
          throw AppError.tooManyRequests(
            'Max concurrent calls reached (5). Try again in 30 seconds.',
          );
        }

        return { data: { callId, status: 'pending' } };
      } catch (err) {
        throw AppError.internal(`Failed to initiate call: ${(err as Error).message}`);
      }
    },
  );

  // ─── Get call details ────────────────────────────────────────────────────

  app.get(
    '/api/v1/voice/calls/:id',
    { preHandler: [app.authenticate], schema: { tags: ['Voice'], summary: 'Get call details' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const call = await getCall(id, orgId);
      if (!call) throw AppError.notFound('Call');

      return { data: call };
    },
  );

  // ─── List calls for contact ──────────────────────────────────────────────

  app.get(
    '/api/v1/voice/calls/contact/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Voice'], summary: 'List calls for contact' },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { limit } = z
        .object({ limit: z.coerce.number().int().max(1000).default(50) })
        .parse(req.query);

      const callList = await getCallsByContact(id, orgId, limit);
      return { data: callList };
    },
  );

  // ─── List calls for campaign ─────────────────────────────────────────────

  app.get(
    '/api/v1/voice/campaigns/:id/calls',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Voice'], summary: 'List calls for campaign' },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { limit } = z
        .object({ limit: z.coerce.number().int().max(1000).default(100) })
        .parse(req.query);

      const callList = await getCallsByCampaign(id, orgId, limit);
      return { data: callList };
    },
  );

  // ─── Campaign call statistics ────────────────────────────────────────────

  app.get(
    '/api/v1/voice/campaigns/:id/stats',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Voice'], summary: 'Campaign call statistics' },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const stats = await getCallStats(id, orgId);
      return { data: stats };
    },
  );

  // ─── Twilio webhook callback ─────────────────────────────────────────────

  app.post(
    '/api/v1/voice/callback',
    { schema: { tags: ['Voice'], summary: 'Twilio webhook callback (status + recording)' } },
    async (req, reply) => {
      /**
       * Who the caller is, before anything is written.
       *
       * This route takes BOTH ids from the query string and had no check of any
       * kind: no session, no signature. Measured against a real database, an
       * anonymous POST answered 200 and rewrote the call's status, duration,
       * recording URL and Twilio recording sid — so anyone who learned a pair
       * of ids could mark a finished call as failed and point its recording at
       * a file of their own.
       *
       * The same check the SMS and WhatsApp callbacks have carried since #184
       * (lib/twilio-signature.ts). It runs FIRST: the body is not parsed and
       * completeCall is not reached for a request that cannot be verified. A
       * missing Auth Token or public base is NOT VERIFIED, not verified —
       * unsignedWebhooksAllowed() is the only way past it and cannot be reached
       * in production.
       */
      const refusal = twilioSignatureRefusal(req);
      if (refusal) {
        req.log.warn({ code: refusal.code }, '[voice] callback refused');
        return reply.code(401).send({ ...refusal, statusCode: 401 });
      }

      const { call_id, org_id } = z
        .object({
          call_id: z.string().uuid(),
          org_id: z.string().uuid(),
        })
        .parse(req.query);

      // Parse Twilio callback data
      const { CallStatus, RecordingUrl, RecordingSid, CallDuration } = z
        .object({
          CallStatus: z.enum(['completed', 'no-answer', 'busy', 'voicemail', 'failed']).optional(),
          RecordingUrl: z.string().url().optional(),
          RecordingSid: z.string().optional(),
          CallDuration: z.coerce.number().default(0),
        })
        .parse(req.body);

      // Map Twilio status to our enum
      const statusMap: Record<string, 'completed' | 'no_answer' | 'busy' | 'voicemail' | 'failed'> =
        {
          completed: 'completed',
          'no-answer': 'no_answer',
          busy: 'busy',
          voicemail: 'voicemail',
          failed: 'failed',
        };

      const status = CallStatus ? statusMap[CallStatus] : 'completed';

      // Update call record
      const call = await completeCall(call_id, org_id, {
        status,
        durationSeconds: CallDuration,
        recordingUrl: RecordingUrl,
        twilioRecordingSid: RecordingSid,
      });

      if (!call) {
        throw AppError.notFound('Call');
      }

      return { data: { status: 'recorded' } };
    },
  );

  // ─── Answer webhook → TwiML that bridges the call to the AI voice bot ─────────
  // Set this as the Twilio Voice "A call comes in" / outbound answer URL. It
  // returns <Connect><Stream> pointing at the voice-bot Twilio Media Streams
  // bridge, which runs the live Deepgram→Claude→ElevenLabs loop. (The previous
  // /voice/callback is only the status+recording webhook — it stays JSON.)
  const answerHandler = async (
    req: { query: unknown },
    reply: { type: (t: string) => { send: (b: string) => unknown } },
  ) => {
    const { call_id, org_id } = z
      .object({ call_id: z.string().optional(), org_id: z.string().optional() })
      .parse(req.query);

    const wssUrl = process.env.VOICE_BOT_WSS_URL ?? 'wss://localhost:8788';
    const params = [
      org_id ? `      <Parameter name="orgId" value="${org_id}" />` : '',
      call_id ? `      <Parameter name="callId" value="${call_id}" />` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Response>\n` +
      `  <Connect>\n` +
      `    <Stream url="${wssUrl}">\n` +
      (params ? `${params}\n` : '') +
      `    </Stream>\n` +
      `  </Connect>\n` +
      `</Response>`;

    return reply.type('text/xml').send(twiml);
  };

  app.post(
    '/api/v1/voice/answer',
    { schema: { tags: ['Voice'], summary: 'TwiML — bridge call to AI bot' } },
    answerHandler,
  );
  app.get(
    '/api/v1/voice/answer',
    { schema: { tags: ['Voice'], summary: 'TwiML — bridge call to AI bot' } },
    answerHandler,
  );
}
