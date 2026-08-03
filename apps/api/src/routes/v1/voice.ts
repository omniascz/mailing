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

export default async function voiceRoutes(app: FastifyInstance) {
  // ─── Initiate outbound call ──────────────────────────────────────────────

  app.post(
    '/api/v1/voice/calls/initiate',
    { schema: { tags: ['Voice'], summary: 'Initiate outbound call' } },
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
    { schema: { tags: ['Voice'], summary: 'Get call details' } },
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
    { schema: { tags: ['Voice'], summary: 'List calls for contact' } },
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
    { schema: { tags: ['Voice'], summary: 'List calls for campaign' } },
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
    { schema: { tags: ['Voice'], summary: 'Campaign call statistics' } },
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
    async (req) => {
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
