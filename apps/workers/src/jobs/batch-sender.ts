/**
 * BatchSender job — processes a batch of contacts for a campaign.
 *
 * For each contact in the batch:
 *   1. Load contact data (email, name, custom fields)
 *   2. Check suppression list
 *   3. Check frequency cap
 *   4. Resolve merge tags in subject + HTML
 *   5. Render final HTML (with tracking pixel + click tracking)
 *   6. Detect ISP from recipient domain
 *   7. Enqueue into the correct per-ISP MTA queue
 *
 * Receives: BatchSenderJobData
 * Produces: N × MtaSendJobData into mta-{isp} queues
 */

import { Worker, type Job } from 'bullmq';
import crypto from 'node:crypto';
import {
  renderEmail as renderBlocks,
  renderPlainText,
  type MergeTagContext,
} from '@forgemsg/editor/render';
import { emailSchema, type EmailSchema } from '@forgemsg/editor/schema';
import {
  connection,
  QUEUE_NAMES,
  detectIsp,
  getMtaQueue,
  type BatchSenderJobData,
  type MtaSendJobData,
  type MessageStream,
} from '../queues/index.js';

interface ContactRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customFields: Record<string, unknown>;
}

async function processBatchSender(job: Job<BatchSenderJobData>) {
  const data = job.data;
  const stream: MessageStream = data.stream ?? 'broadcast';

  job.log(`Processing batch ${data.batchIndex} for campaign ${data.campaignId} stream=${stream} (${data.contactIds.length} contacts)`);

  // Load contacts from the API
  const contacts = await fetchContacts(data.orgId, data.contactIds);

  let sent = 0;
  let skipped = 0;

  const mtaJobs: Array<{
    queue: ReturnType<typeof getMtaQueue>;
    name: string;
    data: MtaSendJobData;
    opts: { priority: number };
  }> = [];

  for (const contact of contacts) {
    // 1. Check suppression — transactional stream skips suppression
    if (stream !== 'transactional') {
      const suppressed = await checkSuppression(data.orgId, contact.email);
      if (suppressed) {
        skipped++;
        continue;
      }
    }

    // 2. Check frequency cap — only broadcast stream is capped
    if (stream === 'broadcast') {
      const capped = await checkFrequencyCap(data.orgId, contact.id);
      if (capped) {
        skipped++;
        continue;
      }
    }

    // 3. Resolve merge tags in subject
    const subject = resolveMergeTags(data.subject, contact);

    // 4. Render HTML + plain-text alternative (block JSON path via
    //    @forgemsg/editor renderEmail + renderPlainText; legacy { html }
    //    path uses inline merge tags + HTML→text fallback).
    const { html: htmlBody, text: textBody } = renderEmail(
      data.content,
      contact,
      data.preheader,
    );

    // 5. Build custom headers
    const messageId = `${crypto.randomUUID()}@forgemsg.com`;
    const unsubToken = Buffer.from(JSON.stringify({
      orgId: data.orgId,
      contactId: contact.id,
      campaignId: data.campaignId,
    })).toString('base64url');

    const customHeaders: Record<string, string> = {
      'X-Mailer': 'ForgeMsg/1.0',
      'X-ForgeMsg-Campaign': data.campaignId,
      'X-ForgeMsg-Org': data.orgId,
      'List-Unsubscribe': `<mailto:unsubscribe@forgemsg.com?subject=${unsubToken}>, <https://app.forgemsg.com/unsubscribe/${unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };

    // 6. Detect ISP and route to the correct queue
    const recipientDomain = contact.email.split('@')[1] ?? 'other';
    const isp = detectIsp(recipientDomain);
    const queue = getMtaQueue(isp);

    mtaJobs.push({
      queue,
      name: `send-${messageId}`,
      data: {
        campaignId: data.campaignId,
        orgId: data.orgId,
        contactId: contact.id,
        messageId,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        toEmail: contact.email,
        toName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
        subject,
        htmlBody,
        textBody,
        replyTo: data.replyTo,
        customHeaders,
        dkimDomain: data.dkimDomain,
        dkimSelector: data.dkimSelector,
        dkimPrivateKey: data.dkimPrivateKey,
        priority: data.priority,
        stream,
      },
      opts: { priority: data.priority },
    });

    sent++;
  }

  // Bulk enqueue per-ISP (group by queue for efficiency)
  const byQueue = new Map<ReturnType<typeof getMtaQueue>, typeof mtaJobs>();
  for (const j of mtaJobs) {
    const existing = byQueue.get(j.queue) ?? [];
    existing.push(j);
    byQueue.set(j.queue, existing);
  }

  for (const [queue, jobs] of byQueue) {
    await queue.addBulk(
      jobs.map((j) => ({ name: j.name, data: j.data, opts: j.opts })),
    );
  }

  // Record frequency cap sends
  for (const j of mtaJobs) {
    await recordFrequencySend(data.orgId, j.data.contactId);
  }

  job.log(`Batch ${data.batchIndex}: sent=${sent}, skipped=${skipped}`);

  return { sent, skipped };
}

// ─── Merge tag resolution ────────────────────────────────────────────────────

function resolveMergeTags(template: string, contact: ContactRow): string {
  return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_match, field: string, fallback?: string) => {
    const value = getContactField(contact, field);
    return value ?? fallback ?? '';
  });
}

function getContactField(contact: ContactRow, field: string): string | undefined {
  const map: Record<string, string | null> = {
    first_name: contact.firstName,
    firstName: contact.firstName,
    last_name: contact.lastName,
    lastName: contact.lastName,
    email: contact.email,
  };

  if (field in map && map[field] != null) return map[field]!;

  // Check custom fields
  const cf = contact.customFields?.[field];
  if (cf != null) return String(cf);

  return undefined;
}

/**
 * Build a MergeTagContext from a fetched contact row. Custom fields are spread
 * onto the contact so {{ custom_field_name }} resolves directly. System keys
 * (unsubscribe_url, view_in_browser_url, current_date/year) are populated when
 * passed in via systemContext.
 */
function buildMergeContext(
  contact: ContactRow,
  systemContext?: MergeTagContext['system'],
): MergeTagContext {
  return {
    contact: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      ...contact.customFields,
    },
    system: systemContext,
  };
}

interface RenderedEmail {
  html: string;
  /** Auto-derived plain-text alternative for multipart/alternative MIME part. */
  text: string;
}

/**
 * Render a campaign email for a specific contact, producing both an HTML
 * body and a plain-text alternative. The plain text is required by Gmail/
 * Yahoo 2024+ bulk-sender rules and reduces spam scoring across the board.
 *
 * Three input shapes are accepted, in priority order:
 *  1. EmailSchema (block JSON) — production path; renderBlocks() + renderPlainText()
 *  2. Legacy { html: string } [+ optional { text: string }] — backward compat
 *  3. Anything else → JSON.stringify (debug aid, never produced in prod)
 */
function renderEmail(
  content: Record<string, unknown>,
  contact: ContactRow,
  preheader?: string,
): RenderedEmail {
  // Path 1: block JSON (production)
  if ('blocks' in content && Array.isArray((content as { blocks?: unknown }).blocks)) {
    const parsed = emailSchema.safeParse({
      preheader: preheader ?? '',
      ...content,
    } satisfies Partial<EmailSchema> | Record<string, unknown>);

    if (parsed.success) {
      const ctx = buildMergeContext(contact);
      const html = renderBlocks(parsed.data, { context: ctx }).html;
      const text = renderPlainText(parsed.data, { context: ctx });
      return { html, text };
    }
    console.warn(
      `[batch-sender] Invalid EmailSchema for contact ${contact.id}, falling back to legacy render:`,
      parsed.error.message,
    );
  }

  // Path 2: legacy raw HTML (+ optional text override)
  const html = (content as { html?: string }).html;
  if (html) {
    let resolved = resolveMergeTags(html, contact);
    if (preheader) {
      const preheaderHtml = `<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>`;
      resolved = resolved.replace(/<body[^>]*>/i, (m) => m + preheaderHtml);
    }
    const textOverride = (content as { text?: string }).text;
    const text = textOverride
      ? resolveMergeTags(textOverride, contact)
      : deriveTextFromHtml(resolved);
    return { html: resolved, text };
  }

  // Path 3: fallback (should never happen in production)
  const serialised = JSON.stringify(content);
  return { html: serialised, text: serialised };
}

/**
 * Best-effort HTML→text conversion for the legacy { html } path. The block
 * path uses renderPlainText() from @forgemsg/editor which is far more
 * accurate; this helper exists only so legacy campaigns also benefit from
 * the multipart/alternative deliverability bump.
 */
function deriveTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── External service stubs ──────────────────────────────────────────────────

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function fetchContacts(orgId: string, contactIds: string[]): Promise<ContactRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/contacts/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactIds }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = (await res.json()) as { data: ContactRow[] };
    return body.data;
  } catch (err) {
    console.error('fetchContacts failed:', err);
    return [];
  }
}

async function checkSuppression(orgId: string, email: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/suppressions/check?orgId=${orgId}&email=${encodeURIComponent(email)}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { suppressed: boolean } };
    return body.data.suppressed;
  } catch {
    return false; // fail open — don't block sending on API errors
  }
}

async function checkFrequencyCap(orgId: string, contactId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/frequency/check?orgId=${orgId}&contactId=${contactId}&channel=email`);
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { capped: boolean } };
    return body.data.capped;
  } catch {
    return false;
  }
}

async function recordFrequencySend(orgId: string, contactId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/frequency/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactId, channel: 'email' }),
    });
  } catch {
    // non-critical
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export function startBatchSenderWorker(queueName: string = QUEUE_NAMES.BATCH_SENDER) {
  const worker = new Worker<BatchSenderJobData>(
    queueName,
    processBatchSender,
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[batch-sender] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[batch-sender] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
