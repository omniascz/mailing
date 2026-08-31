/**
 * DMARC IMAP polling worker.
 *
 * ISPs (Gmail, Yahoo, Outlook, etc.) send DMARC aggregate XML reports as email
 * attachments to the address in the domain's `rua=` DMARC record. This worker
 * polls that mailbox via IMAP, extracts the gzipped / zipped XML attachments,
 * decompresses them, and forwards each to the existing `receiveDmarcReport()`
 * ingestion function.
 *
 * Configuration (env vars):
 *   DMARC_IMAP_HOST      — e.g. imap.gmail.com
 *   DMARC_IMAP_PORT      — default 993
 *   DMARC_IMAP_USER      — e.g. dmarc-reports@yourdomain.com
 *   DMARC_IMAP_PASS      — app password / OAuth2 token
 *   DMARC_IMAP_ORG_ID    — default orgId if the XML doesn't contain one
 *   DMARC_IMAP_FOLDER    — INBOX or a dedicated folder (default: INBOX)
 *
 * The worker runs every 4 hours. Each processed message is marked \Seen so it
 * isn't ingested twice.
 */

import { Worker, type Job } from 'bullmq';
import { cronQueue, QUEUE_NAMES, connection as redisConnection } from '../queues/index.js';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const unzip = promisify(zlib.unzip);

// ─── Dynamic import of imapflow (optional dep) ──────────────────────────────
// imapflow is only needed when IMAP is configured, so we import lazily to
// avoid crashing workers that don't have it installed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getImapFlow(): Promise<(new (opts: any) => any) | null> {
  try {
    // Dynamic require to avoid compile-time module resolution failure
    // when imapflow is not yet installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('imapflow') as { ImapFlow: new (o: unknown) => unknown };
    return mod.ImapFlow;
  } catch {
    return null;
  }
}

// ─── XML extraction from attachment buffers ───────────────────────────────────

async function decompressAttachment(buf: Buffer, filename: string): Promise<string | null> {
  const fn = filename.toLowerCase();
  try {
    if (fn.endsWith('.gz') || fn.endsWith('.xml.gz')) {
      return (await gunzip(buf)).toString('utf8');
    }
    if (fn.endsWith('.zip')) {
      // ZIP: attempt raw inflate of the compressed entry (no central directory nav).
      // For production, swap with the `yauzl` package for proper ZIP support.
      const xmlBuf = await unzip(buf).catch(() => inflate(buf));
      return xmlBuf.toString('utf8');
    }
    if (fn.endsWith('.xml')) {
      return buf.toString('utf8');
    }
  } catch {
    return null;
  }
  return null;
}

function extractOrgIdFromXml(xml: string): string | null {
  // Some senders include our custom org ID in the report_metadata/comments block.
  const m = xml.match(/<comment>[^<]*orgId:([a-f0-9-]{36})[^<]*<\/comment>/i);
  return m?.[1] ?? null;
}

// ─── Core poll logic (decoupled from BullMQ for testability) ─────────────────

export async function pollDmarcMailbox(): Promise<{ ingested: number; errors: number }> {
  const host = process.env.DMARC_IMAP_HOST;
  const user = process.env.DMARC_IMAP_USER;
  const pass = process.env.DMARC_IMAP_PASS;
  const defaultOrgId = process.env.DMARC_IMAP_ORG_ID;

  if (!host || !user || !pass || !defaultOrgId) {
    // Not configured — skip silently
    return { ingested: 0, errors: 0 };
  }

  const ImapFlow = await getImapFlow();
  if (!ImapFlow) {
    console.warn('[dmarc-imap] imapflow not installed — skipping DMARC IMAP poll');
    return { ingested: 0, errors: 0 };
  }

  const port = parseInt(process.env.DMARC_IMAP_PORT ?? '993', 10);
  const folder = process.env.DMARC_IMAP_FOLDER ?? 'INBOX';

  // Always use HTTP bridge — workers run in separate process from API
  return pollViaSelfHttp(host, user, pass, defaultOrgId, port, folder, ImapFlow);
}

// ─── Self-HTTP fallback: workers call API endpoint ───────────────────────────

async function pollViaSelfHttp(
  imapHost: string,
  user: string,
  pass: string,
  defaultOrgId: string,
  port: number,
  folder: string,
  ImapFlow: Awaited<ReturnType<typeof getImapFlow>>,
): Promise<{ ingested: number; errors: number }> {
  if (!ImapFlow) return { ingested: 0, errors: 0 };

  const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const secret = process.env.DMARC_INBOUND_SECRET ?? '';

  const client = new ImapFlow({
    host: imapHost,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  let ingested = 0;
  let errors = 0;

  try {
    const lock = await client.getMailboxLock(folder);
    try {
      for await (const msg of client.fetch('UNSEEN', { envelope: true, source: true })) {
        try {
          const rawEmail = msg.source?.toString('utf8') ?? '';
          const xmlBlocks = extractXmlFromMimeEmail(rawEmail);

          for (const { filename, data } of xmlBlocks) {
            const xml = await decompressAttachment(data, filename);
            if (!xml || !xml.includes('<feedback>')) continue;

            const orgId = extractOrgIdFromXml(xml) ?? defaultOrgId;

            const resp = await fetch(`${apiBase}/t/dmarc/report`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-dmarc-secret': secret,
              },
              body: JSON.stringify({ orgId, xml }),
            });

            if (resp.ok) ingested++;
            else errors++;
          }

          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
        } catch (err) {
          console.error('[dmarc-imap] Error processing message', err);
          errors++;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { ingested, errors };
}

// ─── Lightweight MIME parser (no deps) ────────────────────────────────────────

interface MimePart {
  filename: string;
  data: Buffer;
}

function extractXmlFromMimeEmail(raw: string): MimePart[] {
  const parts: MimePart[] = [];
  // Find MIME boundaries
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) return parts;

  const boundary = boundaryMatch[1]!;
  const segments = raw.split(`--${boundary}`);

  for (const seg of segments) {
    const isAttachment = /content-disposition:\s*attachment/i.test(seg);
    const isXmlOrZip = /\.(xml|gz|zip)/i.test(seg);
    if (!isAttachment && !isXmlOrZip) continue;

    const filenameMatch = seg.match(/filename="?([^"\r\n]+)"?/i);
    if (!filenameMatch) continue;
    const filename = filenameMatch[1]!.trim();

    const bodyStart = seg.indexOf('\r\n\r\n');
    if (bodyStart < 0) continue;
    const body = seg.slice(bodyStart + 4).trim();

    const isBase64 = /content-transfer-encoding:\s*base64/i.test(seg);
    const data = isBase64
      ? Buffer.from(body.replace(/\s/g, ''), 'base64')
      : Buffer.from(body, 'utf8');

    parts.push({ filename, data });
  }

  return parts;
}

// ─── BullMQ worker ───────────────────────────────────────────────────────────

export function startDmarcImapPollWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.DMARC_IMAP_POLL,
    async (_job: Job) => {
      const result = await pollDmarcMailbox();
      console.log(
        `[dmarc-imap] Poll complete: ${result.ingested} ingested, ${result.errors} errors`,
      );
      return result;
    },
    { connection: redisConnection },
  );
}

export async function scheduleDmarcImapPoll(): Promise<void> {
  // Only schedule if IMAP is configured
  if (!process.env.DMARC_IMAP_HOST) return;

  const queue = cronQueue(QUEUE_NAMES.DMARC_IMAP_POLL);
  await queue.add(
    'poll',
    {},
    {
      repeat: { pattern: '0 */4 * * *' }, // every 4 hours
      jobId: 'dmarc-imap-poll-cron',
      removeOnComplete: 10,
      removeOnFail: 5,
    },
  );
  await queue.close();
}
