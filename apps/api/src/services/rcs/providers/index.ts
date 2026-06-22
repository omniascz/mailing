/**
 * RCS provider factory. Resolves provider credentials from env (per-deployment).
 * Add per-org credential storage later by swapping resolveRcsConfig().
 */
import type { RcsPayload } from '../../../db/schema/index.js';
import { sendViaSinch, type SinchConfig, type RcsSendResult } from './sinch.js';

export type { RcsSendResult };

export type RcsProvider = 'sinch';

export function resolveRcsProvider(explicit?: string | null): RcsProvider {
  const p = (explicit ?? process.env.RCS_PROVIDER ?? 'sinch').toLowerCase();
  return p === 'sinch' ? 'sinch' : 'sinch';
}

function sinchConfig(): SinchConfig | null {
  const token = process.env.RCS_SINCH_TOKEN;
  const botId = process.env.RCS_SINCH_BOT_ID;
  if (!token || !botId) return null;
  return { token, botId, region: process.env.RCS_SINCH_REGION ?? 'us' };
}

/** Send an RCS message via the configured provider. Returns failed result if unconfigured. */
export async function sendRcs(
  provider: RcsProvider,
  to: string,
  messageType: string,
  payload: RcsPayload,
): Promise<RcsSendResult> {
  if (provider === 'sinch') {
    const cfg = sinchConfig();
    if (!cfg) return { providerId: '', status: 'failed', error: 'RCS Sinch not configured' };
    return sendViaSinch(cfg, to, messageType, payload);
  }
  return { providerId: '', status: 'failed', error: `unknown RCS provider: ${provider}` };
}

/** True when at least one RCS provider has credentials configured. */
export function isRcsConfigured(): boolean {
  return sinchConfig() !== null;
}
