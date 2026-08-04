/**
 * Inbox placement simulation — predicts where email will land per provider
 * (inbox / promotions / spam / updates) based on signals we have.
 * No external API needed — uses our own deliverability data.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { inboxPlacementTests, type ProviderResult } from '../../db/schema/inbox-placement.js';

interface PlacementSignals {
  openRate30d: number;
  complaintRate30d: number;
  bounceRate30d: number;
  hasSpfDkim: boolean;
  hasDmarc: boolean;
  subjectHasSpamWords: boolean;
  missingUnsubscribe: boolean;
  imageToTextRatio: number; // 0-1, 1 = all images
  htmlSizekb: number;
  linkCount: number;
}

const SPAM_WORDS = [
  'free!!!',
  'winner',
  'guaranteed',
  'no obligation',
  'risk-free',
  'click here',
  'act now',
  'limited time offer',
];

function detectSignals(
  subject: string,
  html: string,
  _fromEmail: string,
): Partial<PlacementSignals> {
  const text = html.replace(/<[^>]+>/g, ' ');
  const imgCount = (html.match(/<img/gi) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const linkCount = (html.match(/<a\s/gi) ?? []).length;

  return {
    subjectHasSpamWords: SPAM_WORDS.some(
      (w) => subject.toLowerCase().includes(w) || text.toLowerCase().includes(w),
    ),
    missingUnsubscribe: !/unsubscribe/i.test(html),
    imageToTextRatio: wordCount > 0 ? Math.min(1, imgCount / (wordCount / 10)) : 1,
    htmlSizekb: Math.round(html.length / 1024),
    linkCount,
  };
}

async function getSenderStats(orgId: string) {
  const d30 = new Date(Date.now() - 30 * 86400_000);
  const [row] = await db
    .select({
      sent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
      opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
      complaints: sql<number>`count(*) filter (where event_type = 'complaint')::int`,
      bounces: sql<number>`count(*) filter (where event_type = 'bounce')::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, d30)));

  const sent = Number(row?.sent ?? 1);
  return {
    openRate30d: Number(row?.opens ?? 0) / sent,
    complaintRate30d: Number(row?.complaints ?? 0) / sent,
    bounceRate30d: Number(row?.bounces ?? 0) / sent,
  };
}

function predictProvider(provider: string, signals: PlacementSignals): ProviderResult {
  const reasons: string[] = [];
  let spamScore = 0;
  let promotionsScore = 0;

  // Negative signals → spam
  if (signals.complaintRate30d > 0.002) {
    spamScore += 30;
    reasons.push(`High complaint rate (${(signals.complaintRate30d * 100).toFixed(2)}%)`);
  }
  if (signals.bounceRate30d > 0.05) {
    spamScore += 20;
    reasons.push(`High bounce rate (${(signals.bounceRate30d * 100).toFixed(1)}%)`);
  }
  if (!signals.hasDmarc) {
    spamScore += 10;
    reasons.push('No DMARC policy');
  }
  if (!signals.hasSpfDkim) {
    spamScore += 15;
    reasons.push('SPF/DKIM not verified');
  }
  if (signals.subjectHasSpamWords) {
    spamScore += 20;
    reasons.push('Spam trigger words in subject/body');
  }
  if (signals.missingUnsubscribe) {
    spamScore += 25;
    reasons.push('Missing unsubscribe link');
  }
  if (signals.imageToTextRatio > 0.7) {
    spamScore += 10;
    reasons.push(`Image-heavy email (${(signals.imageToTextRatio * 100).toFixed(0)}% images)`);
  }

  // Promotions signals (Gmail-specific)
  if (provider === 'gmail') {
    if (signals.openRate30d < 0.15) {
      promotionsScore += 20;
      reasons.push('Low engagement signals promotions tab placement');
    }
    if (signals.linkCount > 5) {
      promotionsScore += 10;
      reasons.push('Many links suggest promotional content');
    }
    if (signals.htmlSizekb > 100) {
      promotionsScore += 10;
      reasons.push('Large HTML email');
    }
  }

  const totalNegative = spamScore;
  let prediction: ProviderResult['prediction'];
  let confidence: number;

  if (totalNegative >= 50) {
    prediction = 'spam';
    confidence = Math.min(0.95, 0.5 + totalNegative / 100);
  } else if (provider === 'gmail' && promotionsScore >= 30) {
    prediction = 'promotions';
    confidence = Math.min(0.9, 0.4 + promotionsScore / 100);
  } else if (signals.openRate30d > 0.25 && totalNegative < 20) {
    prediction = 'inbox';
    confidence = Math.min(0.95, 0.6 + signals.openRate30d);
  } else {
    prediction = provider === 'gmail' ? 'promotions' : 'inbox';
    confidence = 0.6;
    if (reasons.length === 0) reasons.push('Sender reputation is neutral');
  }

  return { provider, prediction, confidence, reasons };
}

export async function simulateInboxPlacement(
  orgId: string,
  subject: string,
  html: string,
  fromEmail: string,
  campaignId?: string,
): Promise<typeof inboxPlacementTests.$inferSelect> {
  const [senderStats, detectedSignals] = await Promise.all([
    getSenderStats(orgId),
    Promise.resolve(detectSignals(subject, html, fromEmail)),
  ]);

  const signals: PlacementSignals = {
    openRate30d: senderStats.openRate30d,
    complaintRate30d: senderStats.complaintRate30d,
    bounceRate30d: senderStats.bounceRate30d,
    hasSpfDkim: true, // assume configured (our engine handles DKIM)
    hasDmarc: true,
    ...detectedSignals,
    imageToTextRatio: detectedSignals.imageToTextRatio ?? 0,
    htmlSizekb: detectedSignals.htmlSizekb ?? 0,
    linkCount: detectedSignals.linkCount ?? 0,
    subjectHasSpamWords: detectedSignals.subjectHasSpamWords ?? false,
    missingUnsubscribe: detectedSignals.missingUnsubscribe ?? false,
  };

  const providers = ['gmail', 'outlook', 'yahoo', 'seznam', 'apple_mail'];
  const results = providers.map((p) => predictProvider(p, signals));

  const spamCount = results.filter((r) => r.prediction === 'spam').length;
  const inboxCount = results.filter((r) => r.prediction === 'inbox').length;
  const overallScore = Math.round(
    100 - (spamCount / providers.length) * 60 - senderStats.complaintRate30d * 1000,
  );

  const issues: string[] = [];
  const recommendations: string[] = [];
  if (signals.missingUnsubscribe) {
    issues.push('Missing unsubscribe link');
    recommendations.push('Add a clearly visible unsubscribe link');
  }
  if (signals.complaintRate30d > 0.001) {
    issues.push('Elevated spam complaint rate');
    recommendations.push('Review list hygiene and targeting');
  }
  if (!signals.hasDmarc) {
    issues.push('DMARC not configured');
    recommendations.push('Set up DMARC policy for your sending domain');
  }
  if (signals.imageToTextRatio > 0.6) {
    issues.push('High image-to-text ratio');
    recommendations.push('Add more text content to improve deliverability');
  }
  if (inboxCount >= 3)
    recommendations.push('Good inbox placement expected — keep current practices');

  const [row] = await db
    .insert(inboxPlacementTests)
    .values({
      orgId,
      campaignId: campaignId ?? null,
      subject,
      fromEmail,
      overallScore: Math.max(0, Math.min(100, overallScore)),
      results,
      issues,
      recommendations,
    })
    .returning();

  return row!;
}
