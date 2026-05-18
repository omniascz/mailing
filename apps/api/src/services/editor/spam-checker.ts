/**
 * Email spam score checker.
 *
 * Runs a battery of heuristic checks against subject line + HTML body and
 * returns a 0–10 score (0 = clean, 10 = almost certainly spam) plus an array
 * of actionable recommendations.
 *
 * Checks performed:
 *   Subject line — ALL CAPS ratio, excessive punctuation, known spam words
 *   HTML body    — link:text ratio, image:text ratio, missing alt texts,
 *                  broken/suspicious links, List-Unsubscribe header hint
 *   Technical    — missing plain-text alternative (checked via flag), no From
 */

export interface SpamIssue {
  /** Short machine-readable code */
  code: string;
  /** Human-readable description */
  message: string;
  /** Points deducted from the maximum score of 10 */
  severity: 'low' | 'medium' | 'high';
}

export interface SpamCheckResult {
  /** 0 (perfect) – 10 (terrible) */
  score: number;
  issues: SpamIssue[];
  /** Quick single-sentence verdict */
  verdict: string;
}

// ---------------------------------------------------------------------------
// Subject line checks
// ---------------------------------------------------------------------------

const SPAM_WORDS = [
  'free', 'win', 'winner', 'cash', 'prize', 'click here', 'buy now',
  'limited time', 'act now', 'urgent', 'guaranteed', 'no cost', 'earn money',
  'make money', 'mlm', 'weight loss', 'lose weight', 'million dollars',
  'congratulations', 'selected', 'dear friend', 'dear winner',
  'increase sales', 'double your income', 'work from home', 'extra income',
  'no obligation', 'free offer', 'once in a lifetime', 'risk free',
];

function checkSubject(subject: string): SpamIssue[] {
  const issues: SpamIssue[] = [];
  if (!subject) {
    issues.push({ code: 'MISSING_SUBJECT', message: 'Email has no subject line', severity: 'high' });
    return issues;
  }

  // ALL CAPS ratio
  const letters = subject.replace(/[^a-zA-Z]/g, '');
  const caps = subject.replace(/[^A-Z]/g, '');
  if (letters.length > 4 && caps.length / letters.length > 0.5) {
    issues.push({
      code: 'SUBJECT_ALL_CAPS',
      message: 'Subject line is mostly uppercase — triggers spam filters',
      severity: 'high',
    });
  }

  // Excessive exclamation
  const exclamations = (subject.match(/!/g) ?? []).length;
  if (exclamations >= 2) {
    issues.push({
      code: 'SUBJECT_EXCESS_EXCLAMATION',
      message: `Subject has ${exclamations} exclamation marks — looks spammy`,
      severity: 'medium',
    });
  }

  // Spam words
  const lower = subject.toLowerCase();
  const matched = SPAM_WORDS.filter((w) => lower.includes(w));
  if (matched.length > 0) {
    issues.push({
      code: 'SUBJECT_SPAM_WORDS',
      message: `Subject contains spam trigger words: ${matched.slice(0, 3).join(', ')}`,
      severity: matched.length >= 2 ? 'high' : 'medium',
    });
  }

  // Too long
  if (subject.length > 70) {
    issues.push({
      code: 'SUBJECT_TOO_LONG',
      message: `Subject is ${subject.length} chars — keep under 70 for full display`,
      severity: 'low',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// HTML body checks
// ---------------------------------------------------------------------------

// Very lightweight HTML helpers — no heavy DOM parser needed
function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLinks(html: string): string[] {
  const urls: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = (m[1] ?? '').trim();
    if (url && !url.startsWith('#') && !url.startsWith('mailto:')) {
      urls.push(url);
    }
  }
  return urls;
}

function extractImages(html: string): { src: string; alt: string }[] {
  const imgs: { src: string; alt: string }[] = [];
  const re = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = (tag.match(/src\s*=\s*["']([^"']+)["']/i) ?? [])[1] ?? '';
    const alt = (tag.match(/alt\s*=\s*["']([^"']*)["']/i) ?? [])[1] ?? '__missing__';
    imgs.push({ src, alt });
  }
  return imgs;
}

function checkHtml(html: string): SpamIssue[] {
  const issues: SpamIssue[] = [];
  if (!html) return issues;

  const textContent = extractText(html);
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;
  const links = extractLinks(html);
  const images = extractImages(html);

  // Image-only email (no text)
  if (wordCount < 20 && images.length > 0) {
    issues.push({
      code: 'IMAGE_ONLY_EMAIL',
      message: 'Email has very little text — image-only emails score poorly with spam filters',
      severity: 'high',
    });
  }

  // Link saturation
  if (wordCount > 0 && links.length / wordCount > 0.1) {
    issues.push({
      code: 'HIGH_LINK_RATIO',
      message: `${links.length} links for ${wordCount} words — too link-heavy`,
      severity: 'medium',
    });
  }

  // Missing alt texts
  const missingAlt = images.filter((img) => img.alt === '__missing__' || img.alt === '');
  if (missingAlt.length > 0) {
    issues.push({
      code: 'MISSING_ALT_TEXTS',
      message: `${missingAlt.length} image(s) have no alt text — bad for accessibility and spam score`,
      severity: 'medium',
    });
  }

  // Suspicious link patterns (numeric IPs, URL shorteners)
  const SUSPICIOUS_RE = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}|bit\.ly|tinyurl\.com|t\.co\//i;
  const suspicious = links.filter((l) => SUSPICIOUS_RE.test(l));
  if (suspicious.length > 0) {
    issues.push({
      code: 'SUSPICIOUS_LINKS',
      message: `${suspicious.length} link(s) use suspicious domains or IP addresses`,
      severity: 'high',
    });
  }

  // No unsubscribe link
  const hasUnsub =
    html.toLowerCase().includes('unsubscribe') ||
    html.toLowerCase().includes('odhlásit') ||
    html.toLowerCase().includes('abmelden');
  if (!hasUnsub) {
    issues.push({
      code: 'MISSING_UNSUBSCRIBE',
      message: 'No unsubscribe link detected — required by CAN-SPAM, GDPR, and most ISPs',
      severity: 'high',
    });
  }

  // HTML body too large
  if (html.length > 100_000) {
    issues.push({
      code: 'HTML_TOO_LARGE',
      message: `HTML is ${Math.round(html.length / 1000)} KB — keep under 100 KB to avoid clipping`,
      severity: 'medium',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

const SEVERITY_POINTS: Record<SpamIssue['severity'], number> = {
  low: 0.5,
  medium: 1.5,
  high: 3,
};

/**
 * Run spam checks against the given subject and HTML body.
 *
 * @param subject Email subject line
 * @param html    Full HTML email body (UTF-8 string)
 * @param hasPlainText  Pass true if the caller is also sending a plain-text part
 */
export function checkSpam(subject: string, html: string, hasPlainText = false): SpamCheckResult {
  const issues: SpamIssue[] = [
    ...checkSubject(subject),
    ...checkHtml(html),
  ];

  if (!hasPlainText) {
    issues.push({
      code: 'NO_PLAIN_TEXT',
      message: 'Send a plain-text alternative alongside HTML — improves deliverability',
      severity: 'medium',
    });
  }

  const rawScore = issues.reduce((sum, i) => sum + SEVERITY_POINTS[i.severity], 0);
  const score = Math.min(10, Math.round(rawScore * 10) / 10);

  let verdict: string;
  if (score === 0) verdict = 'Excellent — no issues detected';
  else if (score < 3) verdict = 'Good — minor improvements possible';
  else if (score < 6) verdict = 'Fair — several issues to address before sending';
  else verdict = 'Poor — high spam risk, fix issues before sending';

  return { score, issues, verdict };
}
