/**
 * AI Deliverability Coach — pre-send analysis with actionable fix suggestions.
 * Goes beyond a spam score: explains WHY and HOW to fix each issue.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { callClaude } from '../../lib/ai-client.js';

export interface DeliverabilityIssue {
  category: 'content' | 'reputation' | 'technical' | 'compliance' | 'engagement';
  severity: 'critical' | 'warning' | 'tip';
  title: string;
  explanation: string;
  fix: string;
  impact: string; // what happens if ignored
}

export interface DeliverabilityReport {
  overallScore: number; // 0-100 (100 = best)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: DeliverabilityIssue[];
  strengths: string[];
  estimatedInboxRate: number; // 0-1
  aiCoachMessage: string;
  senderReputation: {
    avgOpenRate30d: number;
    avgBounceRate30d: number;
    avgComplaintRate30d: number;
    warmingStatus: 'warm' | 'cooling' | 'cold';
  };
}

async function getSenderReputation(orgId: string) {
  const d30 = new Date(Date.now() - 30 * 86400_000);
  const [rep] = await db
    .select({
      sent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
      opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
      bounces: sql<number>`count(*) filter (where event_type = 'bounce')::int`,
      complaints: sql<number>`count(*) filter (where event_type = 'complaint')::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, d30)));

  const sent = Number(rep?.sent ?? 0);
  const opens = Number(rep?.opens ?? 0);
  const bounces = Number(rep?.bounces ?? 0);
  const complaints = Number(rep?.complaints ?? 0);

  const openRate = sent > 0 ? opens / sent : 0;
  const bounceRate = sent > 0 ? bounces / sent : 0;
  const complaintRate = sent > 0 ? complaints / sent : 0;

  const warmingStatus: 'warm' | 'cooling' | 'cold' =
    openRate > 0.2 ? 'warm' : openRate > 0.1 ? 'cooling' : 'cold';

  return {
    avgOpenRate30d: openRate,
    avgBounceRate30d: bounceRate,
    avgComplaintRate30d: complaintRate,
    warmingStatus,
  };
}

function ruleCheck(
  subject: string,
  html: string,
  fromName: string,
  fromEmail: string,
): DeliverabilityIssue[] {
  const issues: DeliverabilityIssue[] = [];
  const text = html.replace(/<[^>]+>/g, ' ');

  // Subject line caps
  const capsRatio = (subject.match(/[A-Z]/g)?.length ?? 0) / subject.length;
  if (capsRatio > 0.5 && subject.length > 5) {
    issues.push({
      category: 'content',
      severity: 'warning',
      title: 'Excessive capitals in subject line',
      explanation: 'Subject lines with >50% capitals trigger spam filters.',
      fix: 'Use sentence case or title case instead.',
      impact: 'Higher spam classification probability',
    });
  }

  // Spam words
  const spamWords = [
    'free!!!',
    'click here',
    'act now',
    'limited time',
    'winner',
    'guaranteed',
    'risk-free',
    'no obligation',
    'unsubscribe all',
    'opt out',
  ];
  for (const word of spamWords) {
    if (text.toLowerCase().includes(word)) {
      issues.push({
        category: 'content',
        severity: 'warning',
        title: `Spam trigger word: "${word}"`,
        explanation: `"${word}" is a common spam filter trigger.`,
        fix: `Replace with more natural language.`,
        impact: 'Reduces inbox placement rate',
      });
      break;
    }
  }

  // Image-to-text ratio
  const imgCount = (html.match(/<img/gi) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (imgCount > 0 && wordCount < 30) {
    issues.push({
      category: 'content',
      severity: 'warning',
      title: 'Low text-to-image ratio',
      explanation:
        "Emails that are mostly images have poor deliverability — spam filters can't read image content.",
      fix: 'Add more text content. Aim for at least 60% text.',
      impact: 'Many ESPs will place image-heavy emails in promotions or spam',
    });
  }

  // Unsubscribe link
  if (!/unsubscribe/i.test(html)) {
    issues.push({
      category: 'compliance',
      severity: 'critical',
      title: 'Missing unsubscribe link',
      explanation: 'Required by CAN-SPAM, GDPR, and all major ISPs.',
      fix: 'Add a visible unsubscribe link to your email footer.',
      impact: 'May cause account suspension and legal penalties',
    });
  }

  // Physical address
  if (!/\d{3,}.*\w{4,}/.test(text)) {
    issues.push({
      category: 'compliance',
      severity: 'warning',
      title: 'Physical address may be missing',
      explanation: 'CAN-SPAM requires a valid physical mailing address.',
      fix: 'Add your company name and postal address to the email footer.',
      impact: 'Legal risk in US jurisdictions',
    });
  }

  // From name check
  if (fromName.length < 2 || /noreply|no-reply/i.test(fromEmail)) {
    issues.push({
      category: 'reputation',
      severity: 'tip',
      title: 'Use a human-sounding from name/address',
      explanation: '"no-reply" addresses reduce trust and engagement.',
      fix: 'Use a name like "Maria from Acme" and a real reply-to address.',
      impact: 'Reduces open rates by 10-20%',
    });
  }

  return issues;
}

export async function analyzeDeliverability(
  orgId: string,
  subject: string,
  html: string,
  fromName: string,
  fromEmail: string,
): Promise<DeliverabilityReport> {
  const [repData, ruleIssues] = await Promise.all([
    getSenderReputation(orgId),
    Promise.resolve(ruleCheck(subject, html, fromName, fromEmail)),
  ]);

  // Reputation-based issues
  const repIssues: DeliverabilityIssue[] = [];
  if (repData.avgComplaintRate30d > 0.002) {
    repIssues.push({
      category: 'reputation',
      severity: 'critical',
      title: `High complaint rate: ${(repData.avgComplaintRate30d * 100).toFixed(2)}%`,
      explanation:
        'Spam complaint rate above 0.2% triggers ISP filtering. Gmail threshold is 0.1%.',
      fix: 'Clean your list, improve targeting, and ensure double opt-in.',
      impact: 'ISPs may bulk-folder or block future sends',
    });
  }
  if (repData.avgBounceRate30d > 0.03) {
    repIssues.push({
      category: 'reputation',
      severity: 'warning',
      title: `Bounce rate: ${(repData.avgBounceRate30d * 100).toFixed(1)}%`,
      explanation: 'Hard bounce rate above 3% damages sender reputation.',
      fix: 'Run your list through email validation before sending.',
      impact: 'Triggers automatic IP/domain blocks at major ISPs',
    });
  }
  if (repData.warmingStatus === 'cold') {
    repIssues.push({
      category: 'reputation',
      severity: 'warning',
      title: 'Sender reputation is cold',
      explanation: 'Low recent open rates signal disengagement to ISPs.',
      fix: 'Send only to your most engaged subscribers first to rebuild sender score.',
      impact: 'Higher promotion/spam folder placement',
    });
  }

  const allIssues = [...ruleIssues, ...repIssues];
  const criticals = allIssues.filter((i) => i.severity === 'critical').length;
  const warnings = allIssues.filter((i) => i.severity === 'warning').length;

  // Score: start at 100, deduct
  let score = 100;
  score -= criticals * 20;
  score -= warnings * 8;
  score -= repData.avgComplaintRate30d > 0.001 ? 10 : 0;
  score -= repData.avgBounceRate30d > 0.02 ? 10 : 0;
  score = Math.max(0, Math.min(100, score));

  const grade: DeliverabilityReport['grade'] =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  const strengths: string[] = [];
  if (/unsubscribe/i.test(html)) strengths.push('Has unsubscribe link');
  if (repData.avgOpenRate30d > 0.2)
    strengths.push(`Strong open rate (${(repData.avgOpenRate30d * 100).toFixed(0)}%)`);
  if (repData.avgComplaintRate30d < 0.001) strengths.push('Low complaint rate');
  if (repData.avgBounceRate30d < 0.01) strengths.push('Healthy bounce rate');

  const text = html.replace(/<[^>]+>/g, ' ').slice(0, 2000);
  const aiResult = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',
    tenantId: orgId,
    system: `You are an expert email deliverability coach. Given an email and sender stats, write a concise 2-sentence coaching message that highlights the #1 thing to fix and the #1 strength. Be specific, actionable, encouraging.`,
    user: `Subject: ${subject}\nScore: ${score}/100 (${grade})\nIssues: ${criticals} critical, ${warnings} warnings\nOpen rate 30d: ${(repData.avgOpenRate30d * 100).toFixed(1)}%\nComplaint rate: ${(repData.avgComplaintRate30d * 100).toFixed(3)}%\nBody preview: ${text.slice(0, 400)}`,
    maxTokens: 256,
  }).catch(() => ({
    text: `Score ${score}/100. Focus on fixing the ${criticals > 0 ? 'critical' : 'warning'} issues first.`,
  }));

  return {
    overallScore: score,
    grade,
    issues: allIssues,
    strengths,
    estimatedInboxRate: (score / 100) * 0.95,
    aiCoachMessage: aiResult.text,
    senderReputation: repData,
  };
}
