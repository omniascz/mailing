/**
 * Agent softphone API (#255).
 *
 * Provides WebSocket signaling for the browser-based softphone.
 *
 *  GET  /api/v1/phone/softphone/token    — Twilio Access Token for browser SDK
 *  POST /api/v1/phone/softphone/answer   — Accept inbound call (update status)
 *  POST /api/v1/phone/softphone/hangup   — Hang up / reject call
 *  POST /api/v1/phone/twiml/outbound     — TwiML for outbound call connect
 *  POST /api/v1/phone/voicemail/recorded — Voicemail recording callback
 *
 * WebSocket: /api/v1/phone/softphone/ws  — signaling channel per agent
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { calls } from '../../../db/schema/calls.js';
import { handleVoicemail, buildVoicemailTwiml } from '../../../services/phone/voicemail.js';
import { logCallActivity } from '../../../services/phone/crm-integration.js';
import { AppError } from '../../../lib/app-error.js';

import type { WebSocket as FastifyWebSocket } from '@fastify/websocket';

// In-memory agent → WebSocket map for signaling (single-instance; use Redis pub/sub in prod)
const agentSockets = new Map<string, Set<FastifyWebSocket>>();

const softphoneRoutes: FastifyPluginAsync = async (app) => {
  // ── Twilio Access Token ──────────────────────────────────────────────────────
  // Issues a Twilio Access Token + Voice Grant so the browser SDK can connect.

  app.get(
    '/api/v1/phone/softphone/token',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const token = generateTwilioAccessToken(req.user!.userId);
      return reply.send({ data: { token } });
    },
  );

  // ── Answer inbound call ──────────────────────────────────────────────────────

  app.post(
    '/api/v1/phone/softphone/answer',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const { callId } = z.object({ callId: z.string().uuid() }).parse(req.body);
      const [call] = await db
        .select()
        .from(calls)
        .where(and(eq(calls.id, callId), eq(calls.orgId, req.user!.orgId)))
        .limit(1);
      if (!call) throw AppError.notFound('Call');

      await db
        .update(calls)
        .set({ status: 'in_progress', agentId: req.user!.userId, updatedAt: new Date() })
        .where(eq(calls.id, callId));

      return reply.send({ data: { answered: true } });
    },
  );

  // ── Hangup / reject ──────────────────────────────────────────────────────────

  app.post(
    '/api/v1/phone/softphone/hangup',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const { callId } = z.object({ callId: z.string().uuid() }).parse(req.body);
      const [call] = await db
        .select()
        .from(calls)
        .where(and(eq(calls.id, callId), eq(calls.orgId, req.user!.orgId)))
        .limit(1);
      if (!call) throw AppError.notFound('Call');

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (accountSid && authToken && call.twilioCallSid) {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.twilioCallSid}.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ Status: 'completed' }),
          },
        ).catch(() => {});
      }

      await db
        .update(calls)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(calls.id, callId));

      // Auto-log CRM activity after hangup
      await logCallActivity(req.user!.orgId, callId).catch(() => {});

      return reply.send({ data: { hung_up: true } });
    },
  );

  // ── TwiML for outbound call ──────────────────────────────────────────────────

  app.post(
    '/api/v1/phone/twiml/outbound',
    {
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const { callId } = z.object({ callId: z.string().uuid() }).parse(req.query);
      const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
      if (!call) {
        return reply.type('text/xml').send('<Response><Hangup/></Response>');
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${call.fromNumber ?? ''}">
    <Number>${call.toNumber ?? ''}</Number>
  </Dial>
</Response>`;
      return reply.type('text/xml').send(twiml);
    },
  );

  // ── Voicemail recording callback ─────────────────────────────────────────────

  app.post(
    '/api/v1/phone/voicemail/recorded',
    {
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          CallSid: z.string(),
          RecordingSid: z.string(),
          RecordingUrl: z.string(),
          orgId: z.string().uuid().optional(),
          callId: z.string().uuid().optional(),
        })
        .parse(req.body);

      if (body.callId && body.orgId) {
        await handleVoicemail(
          body.orgId,
          body.callId,
          `${body.RecordingUrl}.mp3`,
          body.RecordingSid,
        ).catch(() => {});
      }

      // Respond with TwiML to end the call
      return reply
        .type('text/xml')
        .send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    },
  );

  // ── Twilio call status webhook ───────────────────────────────────────────────

  app.post(
    '/api/v1/webhooks/twilio/call-status',
    {
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          CallSid: z.string(),
          CallStatus: z.string(),
          Duration: z.string().optional(),
          AnsweredBy: z.string().optional(),
        })
        .parse(req.body);

      // Find call by twilioCallSid
      const [call] = await db
        .select()
        .from(calls)
        .where(eq(calls.twilioCallSid, body.CallSid))
        .limit(1);

      if (call) {
        const statusMap: Record<string, string> = {
          completed: 'completed',
          failed: 'failed',
          busy: 'busy',
          'no-answer': 'no-answer',
          canceled: 'canceled',
          'in-progress': 'in-progress',
          ringing: 'ringing',
        };

        const status = statusMap[body.CallStatus] as typeof call.status | undefined;
        const durationSeconds = body.Duration ? parseInt(body.Duration, 10) : undefined;

        await db
          .update(calls)
          .set({
            ...(status ? { status } : {}),
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
            updatedAt: new Date(),
          })
          .where(eq(calls.id, call.id));

        // Auto-log CRM activity when call completes
        if (body.CallStatus === 'completed') {
          await logCallActivity(call.orgId, call.id).catch(() => {});
        }

        // Detect voicemail
        if (body.AnsweredBy === 'machine_start' || body.AnsweredBy === 'machine_end_beep') {
          const org = { name: 'ForgeMsg' }; // org name lookup omitted for brevity
          const twiml = buildVoicemailTwiml(org.name);
          return reply.type('text/xml').send(twiml);
        }
      }

      return reply.send({ received: true });
    },
  );

  // ── Twilio recording webhook ─────────────────────────────────────────────────

  app.post(
    '/api/v1/webhooks/twilio/recording',
    {
      schema: { tags: ['Softphone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          CallSid: z.string(),
          RecordingSid: z.string(),
          RecordingUrl: z.string(),
          RecordingDuration: z.string().optional(),
        })
        .parse(req.body);

      const [call] = await db
        .select()
        .from(calls)
        .where(eq(calls.twilioCallSid, body.CallSid))
        .limit(1);

      if (call) {
        const { storeRecording } = await import('../../../services/phone/recording.js');
        await storeRecording(call.orgId, call.id, body.RecordingSid, 'twilio').catch(() => {});
      }

      return reply.send({ received: true });
    },
  );

  // ── WebSocket signaling ──────────────────────────────────────────────────────
  // Each agent connects here to receive real-time inbound call notifications.

  app.get('/api/v1/phone/softphone/ws', { websocket: true }, (socket, req) => {
    const agentId = (req as { user?: { id: string } }).user?.id;
    if (!agentId) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    if (!agentSockets.has(agentId)) agentSockets.set(agentId, new Set());
    agentSockets.get(agentId)!.add(socket);

    socket.on('close', () => {
      agentSockets.get(agentId)?.delete(socket);
    });

    socket.send(JSON.stringify({ type: 'connected', agentId }));
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTwilioAccessToken(userId: string): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    // Return empty token — frontend will handle missing credentials
    return '';
  }

  // In production use twilio npm package: new AccessToken(accountSid, apiKey, apiSecret)
  // For now, return a placeholder that signals the config is present
  return `${apiKey}:${userId}:${appSid}`;
}

// ─── Broadcast inbound call to agent sockets ─────────────────────────────────

export function notifyAgentOfInboundCall(
  agentId: string,
  callId: string,
  fromNumber: string,
): void {
  const sockets = agentSockets.get(agentId);
  if (!sockets) return;
  const payload = JSON.stringify({ type: 'inbound_call', callId, fromNumber });
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      /* ignore closed socket */
    }
  }
}

export default softphoneRoutes;
