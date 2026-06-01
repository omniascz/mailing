/**
 * AMP for Email native renderer (§9 P1).
 *
 * AMP for Email is Google's MIME extension that lets a single message
 * carry an interactive AMP version alongside the regular HTML one.
 * Recipients whose mailbox supports AMP (Gmail, Mail.ru, FairEmail) see
 * the interactive variant; everyone else sees the HTML fallback. The
 * platform MTA already handles multipart MIME; what we need here is to
 * accept an `amp_html` body, validate it, and feed it back to the MTA
 * in a `text/x-amp-html` part placed *before* `text/html` so AMP-aware
 * clients pick it first.
 *
 * Spec: https://developers.google.com/gmail/ampemail/
 *
 * What this module does:
 *   • parses + validates the AMP doctype + required boilerplate
 *   • strips a small set of well-known dangerous tags so a careless
 *     copy-paste from a regular HTML template doesn't get smuggled in
 *   • surfaces a structured validation report so the API can refuse
 *     bad AMP at request time instead of producing invalid mail
 *
 * What it does NOT do:
 *   • full AMP validation (use the official `amp-toolbox/validator`
 *     in the editor pipeline; this is a backend safety net, not the
 *     authoring tool)
 *   • CSS optimisation (Gmail caps inline CSS at 75KB; the editor
 *     should warn before sending here)
 */

export interface AmpValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Size in bytes after trimming. */
  sizeBytes: number;
}

export interface AmpRenderResult {
  /** Sanitised AMP body, ready for the MTA. Empty string when validation fails. */
  amp: string;
  /** Validation report — surfaced to the caller for editor warnings. */
  report: AmpValidationReport;
}

const REQUIRED_AMP_HTML = '<html ⚡4email';
const REQUIRED_AMP_RUNTIME = 'https://cdn.ampproject.org/v0.js';

/**
 * Subset of tags that must never appear inside an AMP4EMAIL body. The
 * full AMP spec disallows much more; this list catches the high-value
 * misuses (script tags from regular HTML templates, iframes pointing
 * off-platform, forms that bypass amp-form).
 */
const DANGEROUS_TAGS = [
  'script',
  'object',
  'embed',
  'iframe',
  'meta', // except amp-required
  'link', // except amp-required
];

/** Max payload Gmail will route. */
const AMP_MAX_BYTES = 75 * 1024;

/**
 * Strip the canonical AMP runtime + extension script tags before the
 * forbidden-tag scan. These are required by the spec and would
 * otherwise trip the bare <script> rule.
 */
function stripAllowedAmpScripts(input: string): string {
  return input
    // AMP runtime + extension scripts (both self-closing and with body)
    .replace(
      /<script\s+[^>]*src=["']https:\/\/cdn\.ampproject\.org\/[^"']+["'][^>]*>\s*<\/script>/gi,
      '',
    )
    .replace(
      /<script\s+[^>]*src=["']https:\/\/cdn\.ampproject\.org\/[^"']+["'][^>]*\/>/gi,
      '',
    )
    // amp-* custom tags rendered with internal scripts (amp-script body):
    // remove only the matching pair so we don't leak content to the body
    // scan further down.
    .replace(/<amp-script[^>]*>[\s\S]*?<\/amp-script>/gi, '');
}

/** Extract just the body section (or the whole input if no <body> present). */
function extractBody(input: string): string {
  const bodyOpen = input.search(/<body[\s>]/i);
  const bodyClose = input.search(/<\/body\s*>/i);
  if (bodyOpen === -1 || bodyClose === -1 || bodyClose <= bodyOpen) return input;
  return input.slice(bodyOpen, bodyClose);
}

export function validateAmp(amp: string): AmpValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = (amp ?? '').trim();
  const sizeBytes = Buffer.byteLength(trimmed, 'utf-8');

  if (!trimmed) {
    errors.push('empty_amp_body');
  }
  if (sizeBytes > AMP_MAX_BYTES) {
    errors.push(`amp_body_over_${AMP_MAX_BYTES}_bytes`);
  }
  // Required doctype
  if (
    !trimmed.startsWith('<!doctype html') &&
    !trimmed.startsWith('<!DOCTYPE html')
  ) {
    errors.push('missing_doctype');
  }
  // Required AMP4EMAIL signal — Gmail accepts both `⚡4email` and
  // the long-form `amp4email` attribute.
  if (
    !trimmed.includes(REQUIRED_AMP_HTML) &&
    !trimmed.includes('<html amp4email')
  ) {
    errors.push('missing_amp4email_attribute');
  }
  // Runtime script is mandatory
  if (!trimmed.includes(REQUIRED_AMP_RUNTIME)) {
    errors.push('missing_amp_runtime');
  }
  // Forbidden-tag scan runs on the body only, with allowed AMP scripts
  // stripped first. That keeps the canonical AMP runtime + amp-script
  // pairs from being misclassified while still catching raw script /
  // iframe / object / embed in the message body.
  const body = stripAllowedAmpScripts(extractBody(trimmed));
  for (const tag of DANGEROUS_TAGS) {
    const re = new RegExp(`<\\s*${tag}(?![a-z0-9-])`, 'i');
    if (re.test(body)) {
      if (tag === 'meta' || tag === 'link') {
        warnings.push(`uses_${tag}_tag`);
      } else {
        errors.push(`forbidden_tag_${tag}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, sizeBytes };
}

/**
 * Validate then trim the body. On failure we return an empty `amp`
 * string so the caller can decide whether to drop the AMP part
 * (recommended) or to fail the whole request.
 */
export function renderAmp(amp: string): AmpRenderResult {
  const report = validateAmp(amp);
  return { amp: report.valid ? amp.trim() : '', report };
}

/**
 * Build the ordered MIME parts the engine will assemble. AMP must
 * precede HTML so AMP-aware clients pick the most expressive variant;
 * plain text is last as the universal fallback.
 */
export interface OrderedMimeParts {
  text: string | null;
  amp: string | null;
  html: string | null;
}

export function buildMimePartOrder(parts: {
  text?: string | null;
  amp?: string | null;
  html?: string | null;
}): OrderedMimeParts {
  return {
    text: parts.text?.trim() || null,
    amp: parts.amp?.trim() || null,
    html: parts.html?.trim() || null,
  };
}
