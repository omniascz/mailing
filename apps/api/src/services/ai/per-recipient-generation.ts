/**
 * Per-recipient AI email generation.
 * Generates a truly unique subject + body for each contact based on their
 * profile, purchase history, and engagement patterns.
 */
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { callClaude } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';
import { buildBrandVoiceContext, getActiveBrandVoice } from './brand-voice.js';

const SYSTEM = `You are an expert email copywriter. Generate a personalized email for this specific recipient.
Use their profile data to make the email feel 1:1, not mass-broadcast. Reference specific details where available.
Output ONLY valid JSON:
{
  "subject": "...",
  "preheader": "...",
  "greeting": "...",
  "body_html": "<p>...</p>",
  "cta_text": "...",
  "personalization_signals_used": ["first_name", "last_purchase", ...]
}`;

export interface PerRecipientResult {
  subject: string;
  preheader: string;
  greeting: string;
  bodyHtml: string;
  ctaText: string;
  personalizationSignalsUsed: string[];
}

export async function generateForRecipient(
  orgId: string,
  contactId: string,
  opts: {
    campaignGoal: string;
    ctaUrl: string;
    tone?: string;
    useBrandVoice?: boolean;
  },
): Promise<PerRecipientResult> {
  const cacheKey = `per-recipient:${orgId}:${contactId}:${opts.campaignGoal.slice(0, 40)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as PerRecipientResult;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) throw AppError.notFound('Contact not found');

  const brandVoice = opts.useBrandVoice ? await getActiveBrandVoice(orgId) : null;
  const bvCtx = buildBrandVoiceContext(brandVoice);

  const userPrompt = [
    `Campaign goal: ${opts.campaignGoal}`,
    `Tone: ${opts.tone ?? 'friendly'}`,
    `CTA URL: ${opts.ctaUrl}`,
    `Recipient profile:`,
    `  - First name: ${contact.firstName ?? 'there'}`,
    `  - Last name: ${contact.lastName ?? ''}`,
    `  - Tags: ${(contact as Record<string, unknown>).tags ? JSON.stringify((contact as Record<string, unknown>).tags) : 'none'}`,
    `  - Custom fields: ${contact.customFields ? JSON.stringify(contact.customFields).slice(0, 500) : 'none'}`,
    bvCtx,
  ]
    .filter(Boolean)
    .join('\n');

  const { text } = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    system: SYSTEM,
    user: userPrompt,
    maxTokens: 1500,
    feature: 'generate_email',
    tenantId: orgId,
  });

  let parsed: PerRecipientResult;
  try {
    const raw = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as Record<
      string,
      unknown
    >;
    parsed = {
      subject: String(raw['subject'] ?? ''),
      preheader: String(raw['preheader'] ?? ''),
      greeting: String(raw['greeting'] ?? ''),
      bodyHtml: String(raw['body_html'] ?? ''),
      ctaText: String(raw['cta_text'] ?? 'Learn more'),
      personalizationSignalsUsed: Array.isArray(raw['personalization_signals_used'])
        ? (raw['personalization_signals_used'] as string[])
        : [],
    };
  } catch {
    throw AppError.internal('AI returned invalid structure for per-recipient email');
  }

  await redis.setex(cacheKey, 3600, JSON.stringify(parsed));
  return parsed;
}

/** Generate for a batch of contacts (up to 50 at a time) */
export async function generateBatchPerRecipient(
  orgId: string,
  contactIds: string[],
  opts: { campaignGoal: string; ctaUrl: string; tone?: string; useBrandVoice?: boolean },
): Promise<Record<string, PerRecipientResult>> {
  const results: Record<string, PerRecipientResult> = {};
  await Promise.all(
    contactIds.slice(0, 50).map(async (cid) => {
      try {
        results[cid] = await generateForRecipient(orgId, cid, opts);
      } catch {
        // Skip failed contacts
      }
    }),
  );
  return results;
}
