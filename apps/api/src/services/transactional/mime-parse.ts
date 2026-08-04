/**
 * Minimal RFC 5322 / MIME parser for the raw-message send path (SES
 * SendRawEmail equivalent) and the SMTP submission relay.
 *
 * Extracts the envelope (From/To/Cc/Subject/Reply-To) plus text/html bodies and
 * the remaining custom headers, so a caller-supplied raw message can be routed
 * through the existing structured send pipeline. Pure + dependency-free so it's
 * unit-testable; handles header folding, address lists, multipart/alternative,
 * quoted-printable + base64 transfer-encodings, and basic RFC 2047 subjects.
 */

export interface ParsedMime {
  from: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  replyTo: string | null;
  html: string | null;
  text: string | null;
  /** Headers not mapped above (for pass-through as customHeaders). */
  headers: Record<string, string>;
}

/** Split raw message into the header block and the body. */
function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
  const norm = raw.replace(/\r\n/g, '\n');
  const idx = norm.indexOf('\n\n');
  if (idx === -1) return { headerBlock: norm, body: '' };
  return { headerBlock: norm.slice(0, idx), body: norm.slice(idx + 2) };
}

/** Parse header lines with unfolding (continuation lines start with WSP). */
export function parseHeaders(headerBlock: string): Array<[string, string]> {
  const lines = headerBlock.split('\n');
  const out: Array<[string, string]> = [];
  let current: [string, string] | null = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current[1] += ' ' + line.trim();
    } else {
      const m = /^([^:]+):\s?(.*)$/.exec(line);
      if (m) {
        current = [m[1]!.trim(), m[2] ?? ''];
        out.push(current);
      }
    }
  }
  return out;
}

function headerValue(headers: Array<[string, string]>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find(([k]) => k.toLowerCase() === lower)?.[1];
}

/** Decode an RFC 2047 encoded-word header (=?charset?B|Q?text?=), best-effort. */
export function decodeRfc2047(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _cs, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      // Q-encoding: _ = space, =XX = hex byte
      const bytes = data
        .replace(/_/g, ' ')
        .replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) =>
          String.fromCharCode(parseInt(h, 16)),
        );
      return Buffer.from(bytes, 'latin1').toString('utf8');
    } catch {
      return data;
    }
  });
}

/** Parse an address (Name <email>) or bare email into {name,email}. */
export function parseAddress(raw: string): { name: string | null; email: string | null } {
  const s = raw.trim();
  const angle = /^(.*)<([^>]+)>\s*$/.exec(s);
  if (angle) {
    const name = angle[1]!.trim().replace(/^"|"$/g, '').trim() || null;
    return { name: name ? decodeRfc2047(name) : null, email: angle[2]!.trim().toLowerCase() };
  }
  if (/@/.test(s)) return { name: null, email: s.toLowerCase() };
  return { name: null, email: null };
}

/** Split a comma-separated address list, honouring quotes/angle brackets. */
export function parseAddressList(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let buf = '';
  for (const ch of raw) {
    if (ch === '"') quote = !quote;
    if (ch === '<') depth++;
    if (ch === '>') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0 && !quote) {
      const e = parseAddress(buf).email;
      if (e) out.push(e);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const last = parseAddress(buf).email;
  if (last) out.push(last);
  return out;
}

function decodeBody(body: string, cte: string | undefined): string {
  const enc = (cte ?? '').toLowerCase().trim();
  if (enc === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (enc === 'quoted-printable') {
    // Decode to raw bytes first, then interpret as UTF-8 (=C3=A9 → é).
    const unfolded = body.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < unfolded.length; i++) {
      const c = unfolded[i]!;
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
        bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(c.charCodeAt(0) & 0xff);
      }
    }
    return Buffer.from(bytes).toString('utf8');
  }
  return body;
}

function contentTypeOf(headers: Array<[string, string]>): { type: string; boundary?: string } {
  const ct = headerValue(headers, 'content-type') ?? 'text/plain';
  const type = ct.split(';')[0]!.trim().toLowerCase();
  const bm = /boundary\s*=\s*"?([^";]+)"?/i.exec(ct);
  return { type, boundary: bm?.[1] };
}

/** Extract text + html from a message body given its top-level headers. */
function extractBodies(
  topHeaders: Array<[string, string]>,
  body: string,
): { text: string | null; html: string | null } {
  const { type, boundary } = contentTypeOf(topHeaders);

  if (type.startsWith('multipart/') && boundary) {
    let text: string | null = null;
    let html: string | null = null;
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
      const trimmed = part.replace(/^\r?\n/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;
      const { headerBlock, body: partBody } = splitHeadersBody(trimmed);
      const ph = parseHeaders(headerBlock);
      const { type: ptype, boundary: pboundary } = contentTypeOf(ph);
      if (ptype.startsWith('multipart/') && pboundary) {
        const nested = extractBodies(ph, partBody);
        text = text ?? nested.text;
        html = html ?? nested.html;
        continue;
      }
      const decoded = decodeBody(partBody, headerValue(ph, 'content-transfer-encoding'));
      if (ptype === 'text/plain' && text === null) text = decoded.trimEnd();
      else if (ptype === 'text/html' && html === null) html = decoded.trimEnd();
    }
    return { text, html };
  }

  const decoded = decodeBody(body, headerValue(topHeaders, 'content-transfer-encoding'));
  if (type === 'text/html') return { text: null, html: decoded.trimEnd() };
  return { text: decoded.trimEnd(), html: null };
}

const MAPPED_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'reply-to',
  'content-type',
  'content-transfer-encoding',
  'mime-version',
]);

/**
 * Parse a raw RFC 5322 / MIME message into a structured envelope + bodies.
 */
export function parseRawMime(raw: string): ParsedMime {
  const { headerBlock, body } = splitHeadersBody(raw);
  const headers = parseHeaders(headerBlock);

  const fromRaw = headerValue(headers, 'from') ?? '';
  const fromAddr = parseAddress(fromRaw);
  const toRaw = headerValue(headers, 'to') ?? '';
  const ccRaw = headerValue(headers, 'cc') ?? '';
  const subjectRaw = headerValue(headers, 'subject');
  const replyToRaw = headerValue(headers, 'reply-to');

  const { text, html } = extractBodies(headers, body);

  // Remaining headers pass through (dedupe, skip structural + mapped).
  const custom: Record<string, string> = {};
  for (const [k, v] of headers) {
    if (!MAPPED_HEADERS.has(k.toLowerCase()) && !/^content-/i.test(k)) {
      custom[k] = v;
    }
  }

  return {
    from: fromAddr.email,
    fromName: fromAddr.name,
    to: parseAddressList(toRaw),
    cc: parseAddressList(ccRaw),
    subject: subjectRaw ? decodeRfc2047(subjectRaw) : null,
    replyTo: replyToRaw ? parseAddress(replyToRaw).email : null,
    text,
    html,
    headers: custom,
  };
}
