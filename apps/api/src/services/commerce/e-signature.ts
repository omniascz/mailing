/**
 * E-signature service (#309).
 * Built-in simple token-based signing + optional DocuSign / HelloSign adapters.
 * Provider is selected via ESIGN_PROVIDER env var: 'builtin' | 'docusign' | 'hellosign'
 */

import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { quotes } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type ESignProvider = 'builtin' | 'docusign' | 'hellosign';

function getProvider(): ESignProvider {
  const p = (process.env.ESIGN_PROVIDER ?? 'builtin') as ESignProvider;
  return ['builtin', 'docusign', 'hellosign'].includes(p) ? p : 'builtin';
}

// ── Built-in signing ──────────────────────────────────────────────────────────

export async function initiateBuiltinSigning(orgId: string, quoteId: string) {
  const token = randomBytes(32).toString('hex');
  const [row] = await db
    .update(quotes)
    .set({ signatureToken: token, status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .returning();
  if (!row) throw AppError.notFound('Quote not found');

  const signingUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/sign/${token}`;
  return { provider: 'builtin', signingUrl, token };
}

export async function completeBuiltinSigning(token: string, signerName: string, signerIp: string) {
  const [row] = await db
    .update(quotes)
    .set({
      status: 'accepted',
      signedAt: new Date(),
      signedByName: signerName,
      signedByIp: signerIp,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotes.signatureToken, token))
    .returning();
  if (!row) throw AppError.notFound('Invalid or expired signature token');
  return row;
}

// ── DocuSign adapter ──────────────────────────────────────────────────────────

async function initiateDocuSign(orgId: string, quoteId: string, recipientEmail: string, recipientName: string) {
  const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://demo.docusign.net';
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID ?? '';
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN ?? '';

  if (!accountId || !accessToken) throw AppError.badRequest('DocuSign not configured');

  const [quote] = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
  if (!quote) throw AppError.notFound('Quote not found');

  const envelopeBody = {
    emailSubject: `Please sign: ${quote.title}`,
    documents: [{
      documentBase64: Buffer.from(`Quote ${quote.quoteNumber}: ${quote.title}\nTotal: ${quote.total} ${quote.currency}`).toString('base64'),
      name: `Quote_${quote.quoteNumber}.txt`,
      fileExtension: 'txt',
      documentId: '1',
    }],
    recipients: {
      signers: [{
        email: recipientEmail,
        name: recipientName,
        recipientId: '1',
        tabs: { signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '100' }] },
      }],
    },
    status: 'sent',
  };

  const res = await fetch(`${baseUrl}/restapi/v2.1/accounts/${accountId}/envelopes`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(envelopeBody),
  });
  if (!res.ok) throw AppError.badRequest(`DocuSign error: ${res.status}`);
  const data = await res.json() as { envelopeId: string };

  await db
    .update(quotes)
    .set({ esignProvider: 'docusign', esignEnvelopeId: data.envelopeId, esignStatus: 'sent', status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));

  return { provider: 'docusign', envelopeId: data.envelopeId };
}

// ── HelloSign (Dropbox Sign) adapter ─────────────────────────────────────────

async function initiateHelloSign(orgId: string, quoteId: string, recipientEmail: string, recipientName: string) {
  const apiKey = process.env.HELLOSIGN_API_KEY ?? '';
  if (!apiKey) throw AppError.badRequest('HelloSign not configured');

  const [quote] = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
  if (!quote) throw AppError.notFound('Quote not found');

  const formData = new FormData();
  formData.append('title', quote.title);
  formData.append('subject', `Please sign: ${quote.title}`);
  formData.append('signers[0][email_address]', recipientEmail);
  formData.append('signers[0][name]', recipientName);
  formData.append('file_url[0]', quote.pdfUrl ?? `${process.env.APP_BASE_URL}/api/v1/commerce/quotes/${quoteId}/pdf`);

  const res = await fetch('https://api.hellosign.com/v3/signature_request/send', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
    body: formData,
  });
  if (!res.ok) throw AppError.badRequest(`HelloSign error: ${res.status}`);
  const data = await res.json() as { signature_request: { signature_request_id: string } };
  const envelopeId = data.signature_request.signature_request_id;

  await db
    .update(quotes)
    .set({ esignProvider: 'hellosign', esignEnvelopeId: envelopeId, esignStatus: 'sent', status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));

  return { provider: 'hellosign', envelopeId };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function initiateESign(orgId: string, quoteId: string, recipientEmail: string, recipientName: string) {
  const provider = getProvider();
  switch (provider) {
    case 'builtin':  return initiateBuiltinSigning(orgId, quoteId);
    case 'docusign': return initiateDocuSign(orgId, quoteId, recipientEmail, recipientName);
    case 'hellosign': return initiateHelloSign(orgId, quoteId, recipientEmail, recipientName);
  }
}

// Webhook callback from DocuSign / HelloSign to update status
export async function handleESignWebhook(provider: ESignProvider, payload: Record<string, unknown>) {
  if (provider === 'docusign') {
    const envelopeId = String((payload.envelopeId ?? (payload.data as Record<string, unknown>)?.envelopeId ?? ''));
    const status = String(payload.status ?? '').toLowerCase();
    if (!envelopeId) return;
    await db
      .update(quotes)
      .set({ esignStatus: status, ...(status === 'completed' ? { status: 'accepted', acceptedAt: new Date() } : {}), updatedAt: new Date() })
      .where(eq(quotes.esignEnvelopeId, envelopeId));
  } else if (provider === 'hellosign') {
    const event = payload.signature_request as Record<string, unknown> | undefined;
    const envelopeId = String(event?.signature_request_id ?? '');
    const hsStatus = String(event?.is_complete ? 'completed' : 'pending');
    if (!envelopeId) return;
    await db
      .update(quotes)
      .set({ esignStatus: hsStatus, ...(hsStatus === 'completed' ? { status: 'accepted', acceptedAt: new Date() } : {}), updatedAt: new Date() })
      .where(eq(quotes.esignEnvelopeId, envelopeId));
  }
}
