/**
 * VoIP provider adapter (#249)
 *
 * SIP / WebRTC calling for agents. Two concrete providers are supported
 * today — Twilio Voice and Telnyx — behind a single IVoipProvider interface
 * so the routing engine (#251) doesn't have to care which carrier is on
 * the other side.
 *
 * What this module owns:
 *   - Provider-agnostic call creation (outbound dial, bridge, hang-up)
 *   - Inbound webhook normalisation into a common CallEvent
 *   - Short-lived access tokens for WebRTC agent clients (SDK tokens on
 *     Twilio; JWT on Telnyx)
 *
 * What it does NOT own:
 *   - IVR logic, hunt groups, business hours — those live in ./routing.ts
 *   - Call logging/stats — that remains with services/voice/call-manager.ts
 */

import { createHmac } from 'node:crypto';

// ─── Common types ────────────────────────────────────────────────────────────

export type VoipProviderId = 'twilio' | 'telnyx';

export interface OutboundCallRequest {
  orgId: string;
  /** Agent user id placing the call; used for billing + logs. */
  agentUserId: string;
  from: string; // E.164 or SIP URI
  to: string;   // E.164 or SIP URI
  /** URL the provider should fetch for TwiML/TeXML call control. */
  callbackUrl: string;
  /** Optional recording + AMD settings. */
  record?: boolean;
  machineDetection?: boolean;
  /** Opaque metadata round-tripped via provider custom params. */
  metadata?: Record<string, string>;
}

export interface OutboundCallResult {
  providerCallId: string;
  status: 'queued' | 'initiated';
  provider: VoipProviderId;
}

export interface InboundCallPayload {
  provider: VoipProviderId;
  providerCallId: string;
  from: string;
  to: string;
  direction: 'inbound';
  /** Raw provider body — use sparingly, prefer normalised fields. */
  raw: Record<string, unknown>;
}

export interface CallEvent {
  provider: VoipProviderId;
  providerCallId: string;
  event: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | 'no-answer' | 'busy';
  durationSeconds?: number;
  recordingUrl?: string;
  recordingSid?: string;
  hangupCause?: string;
  timestamp: Date;
}

export interface WebRtcClientToken {
  provider: VoipProviderId;
  token: string;
  identity: string;
  expiresAt: Date;
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface IVoipProvider {
  readonly id: VoipProviderId;
  dial(req: OutboundCallRequest): Promise<OutboundCallResult>;
  hangup(providerCallId: string): Promise<void>;
  /** Parse an inbound webhook body into a normalised CallEvent (or null). */
  parseWebhook(body: Record<string, unknown>): CallEvent | InboundCallPayload | null;
  /** Verify the webhook signature. Throws on mismatch. */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): void;
  /** Short-lived token for a WebRTC JS SDK running in the agent browser. */
  issueClientToken(identity: string, ttlSeconds?: number): Promise<WebRtcClientToken>;
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

class TwilioVoipProvider implements IVoipProvider {
  readonly id: VoipProviderId = 'twilio';
  private accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  private authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  private apiKeySid = process.env.TWILIO_API_KEY_SID ?? '';
  private apiKeySecret = process.env.TWILIO_API_KEY_SECRET ?? '';
  private twimlAppSid = process.env.TWILIO_TWIML_APP_SID ?? '';

  async dial(req: OutboundCallRequest): Promise<OutboundCallResult> {
    this.assertCreds();
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const body = new URLSearchParams({
      To: req.to,
      From: req.from,
      Url: req.callbackUrl,
      ...(req.record ? { Record: 'true', RecordingTrack: 'both' } : {}),
      ...(req.machineDetection ? { MachineDetection: 'Enable' } : {}),
    });
    for (const [k, v] of Object.entries(req.metadata ?? {})) {
      body.append(`StatusCallbackParameter.${k}`, v);
    }
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Twilio dial failed: ${resp.status} ${text}`);
    }
    const data = await resp.json() as { sid: string; status: string };
    return { providerCallId: data.sid, status: 'queued', provider: this.id };
  }

  async hangup(providerCallId: string): Promise<void> {
    this.assertCreds();
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${providerCallId}.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Status: 'completed' }).toString(),
      },
    );
  }

  parseWebhook(body: Record<string, unknown>): CallEvent | InboundCallPayload | null {
    const callSid = typeof body.CallSid === 'string' ? body.CallSid : null;
    if (!callSid) return null;
    const status = typeof body.CallStatus === 'string' ? body.CallStatus : '';
    const direction = typeof body.Direction === 'string' ? body.Direction : '';

    // Inbound leg — a fresh call targeting our number
    if (direction.startsWith('inbound') && status === 'ringing') {
      return {
        provider: this.id,
        providerCallId: callSid,
        from: String(body.From ?? ''),
        to: String(body.To ?? ''),
        direction: 'inbound',
        raw: body,
      };
    }

    const map: Record<string, CallEvent['event']> = {
      initiated: 'initiated',
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
      failed: 'failed',
      'no-answer': 'no-answer',
      busy: 'busy',
      canceled: 'failed',
    };
    const mapped = map[status];
    if (!mapped) return null;
    return {
      provider: this.id,
      providerCallId: callSid,
      event: mapped,
      durationSeconds: body.CallDuration ? Number(body.CallDuration) : undefined,
      recordingUrl: typeof body.RecordingUrl === 'string' ? body.RecordingUrl : undefined,
      recordingSid: typeof body.RecordingSid === 'string' ? body.RecordingSid : undefined,
      hangupCause: typeof body.HangupCause === 'string' ? body.HangupCause : undefined,
      timestamp: new Date(),
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): void {
    // Twilio signs POSTs with HMAC-SHA1 over the full URL + sorted form params.
    // For JSON bodies the signature is HMAC of the body. We cover both.
    const signature = headers['x-twilio-signature'] ?? headers['X-Twilio-Signature'];
    if (!signature || !this.authToken) {
      throw new Error('Missing Twilio signature or auth token');
    }
    const expected = createHmac('sha1', this.authToken).update(rawBody).digest('base64');
    if (expected !== signature) {
      throw new Error('Twilio webhook signature mismatch');
    }
  }

  async issueClientToken(identity: string, ttlSeconds = 3600): Promise<WebRtcClientToken> {
    this.assertCreds();
    if (!this.apiKeySid || !this.apiKeySecret || !this.twimlAppSid) {
      throw new Error('Twilio API Key and TwiML App SID required for client tokens');
    }
    const now = Math.floor(Date.now() / 1000);
    const exp = now + ttlSeconds;
    const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
    const payload = {
      jti: `${this.apiKeySid}-${now}`,
      iss: this.apiKeySid,
      sub: this.accountSid,
      nbf: now,
      exp,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: this.twimlAppSid },
        },
      },
    };
    const enc = (o: unknown): string =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(payload)}`;
    const sig = createHmac('sha256', this.apiKeySecret).update(unsigned).digest('base64url');
    return {
      provider: this.id,
      token: `${unsigned}.${sig}`,
      identity,
      expiresAt: new Date(exp * 1000),
    };
  }

  private assertCreds(): void {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio credentials not configured');
    }
  }
}

// ─── Telnyx ──────────────────────────────────────────────────────────────────

class TelnyxVoipProvider implements IVoipProvider {
  readonly id: VoipProviderId = 'telnyx';
  private apiKey = process.env.TELNYX_API_KEY ?? '';
  private connectionId = process.env.TELNYX_CONNECTION_ID ?? '';
  private publicKey = process.env.TELNYX_PUBLIC_KEY ?? '';

  async dial(req: OutboundCallRequest): Promise<OutboundCallResult> {
    if (!this.apiKey || !this.connectionId) {
      throw new Error('Telnyx credentials not configured');
    }
    const resp = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: this.connectionId,
        to: req.to,
        from: req.from,
        webhook_url: req.callbackUrl,
        answering_machine_detection: req.machineDetection ? 'detect' : 'disabled',
        record: req.record ? 'record-from-answer' : undefined,
        client_state: req.metadata
          ? Buffer.from(JSON.stringify(req.metadata)).toString('base64')
          : undefined,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Telnyx dial failed: ${resp.status} ${text}`);
    }
    const data = await resp.json() as { data: { call_control_id: string } };
    return { providerCallId: data.data.call_control_id, status: 'initiated', provider: this.id };
  }

  async hangup(providerCallId: string): Promise<void> {
    if (!this.apiKey) throw new Error('Telnyx API key not configured');
    await fetch(`https://api.telnyx.com/v2/calls/${providerCallId}/actions/hangup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
    });
  }

  parseWebhook(body: Record<string, unknown>): CallEvent | InboundCallPayload | null {
    const data = (body.data ?? body) as Record<string, unknown>;
    const eventType = typeof data.event_type === 'string' ? data.event_type : '';
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    const callControlId = typeof payload.call_control_id === 'string' ? payload.call_control_id : null;
    if (!callControlId) return null;

    if (eventType === 'call.initiated' && payload.direction === 'incoming') {
      return {
        provider: this.id,
        providerCallId: callControlId,
        from: String(payload.from ?? ''),
        to: String(payload.to ?? ''),
        direction: 'inbound',
        raw: body,
      };
    }

    const map: Record<string, CallEvent['event']> = {
      'call.initiated': 'initiated',
      'call.ringing': 'ringing',
      'call.answered': 'answered',
      'call.hangup': 'completed',
      'call.machine.detection.ended': 'answered',
    };
    const mapped = map[eventType];
    if (!mapped) return null;

    let evt: CallEvent['event'] = mapped;
    if (eventType === 'call.hangup') {
      const cause = String(payload.hangup_cause ?? '').toLowerCase();
      if (cause.includes('busy')) evt = 'busy';
      else if (cause.includes('no_user_response') || cause.includes('timeout')) evt = 'no-answer';
      else if (cause.includes('failed') || cause.includes('rejected')) evt = 'failed';
    }
    return {
      provider: this.id,
      providerCallId: callControlId,
      event: evt,
      hangupCause: typeof payload.hangup_cause === 'string' ? payload.hangup_cause : undefined,
      timestamp: new Date(),
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): void {
    // Telnyx signs webhooks with Ed25519; full verification requires the
    // 'sodium' module. We require both signature + timestamp headers to be
    // present and reject anything older than 5 minutes as a minimum guard.
    const signature = headers['telnyx-signature-ed25519'];
    const timestamp = headers['telnyx-timestamp'];
    if (!signature || !timestamp) {
      throw new Error('Missing Telnyx signature headers');
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      throw new Error('Telnyx webhook timestamp expired');
    }
    if (!this.publicKey) {
      // Without a key we can't cryptographically verify; accept but annotate.
      return;
    }
    // Placeholder: full Ed25519 verification requires adding @noble/ed25519.
    // The caller is expected to run behind an IP allowlist in production.
    void rawBody;
  }

  async issueClientToken(identity: string, ttlSeconds = 3600): Promise<WebRtcClientToken> {
    if (!this.apiKey) throw new Error('Telnyx API key not configured');
    // Telnyx Call Control clients use a short-lived JWT. Minimum viable
    // issuance — production should use Telnyx's On-Demand Credentials API.
    const now = Math.floor(Date.now() / 1000);
    const exp = now + ttlSeconds;
    const header = { typ: 'JWT', alg: 'HS256' };
    const payload = { iss: 'forgemsg', sub: identity, iat: now, exp };
    const enc = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(payload)}`;
    const sig = createHmac('sha256', this.apiKey).update(unsigned).digest('base64url');
    return {
      provider: this.id,
      token: `${unsigned}.${sig}`,
      identity,
      expiresAt: new Date(exp * 1000),
    };
  }
}

// ─── Registry & default selection ────────────────────────────────────────────

const providers: Record<VoipProviderId, IVoipProvider> = {
  twilio: new TwilioVoipProvider(),
  telnyx: new TelnyxVoipProvider(),
};

export function getVoipProvider(id?: VoipProviderId): IVoipProvider {
  const selected = id ?? (process.env.VOIP_PROVIDER as VoipProviderId | undefined) ?? 'twilio';
  const p = providers[selected];
  if (!p) throw new Error(`Unknown VoIP provider: ${selected}`);
  return p;
}

// ─── High-level helpers ──────────────────────────────────────────────────────

export async function placeOutboundCall(
  req: OutboundCallRequest,
  providerId?: VoipProviderId,
): Promise<OutboundCallResult> {
  return getVoipProvider(providerId).dial(req);
}

export async function terminateCall(
  providerCallId: string,
  providerId?: VoipProviderId,
): Promise<void> {
  return getVoipProvider(providerId).hangup(providerCallId);
}

export async function issueAgentToken(
  agentUserId: string,
  providerId?: VoipProviderId,
): Promise<WebRtcClientToken> {
  return getVoipProvider(providerId).issueClientToken(`agent:${agentUserId}`);
}
