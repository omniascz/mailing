/**
 * AI-assisted features powered by Claude API.
 *
 *  POST /api/v1/ai/segment-from-description  — natural language → segment conditions (1.10)
 *  POST /api/v1/ai/generate-email            — AI email copywriting (4.5)
 *  POST /api/v1/ai/subject-lines             — AI subject line generator (4.6)
 *  POST /api/v1/ai/analyze-brand-voice       — brand voice extraction (4.7)
 *  POST /api/v1/ai/campaign-summary          — AI campaign report (4.8)
 *  POST /api/v1/ai/translate                 — AI block translation (4.9)
 *  GET  /api/v1/ai/usage                     — AI usage stats (4.11)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { AppError } from '../../lib/app-error.js';
import { callClaude, cacheKey, parseJsonSafe, CACHE_TTL } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { db } from '../../db/client.js';
import { campaigns, organizations } from '../../db/schema/index.js';
import { enrichVariantsWithHistory } from '../../services/ai/subject-line-scorer.js';

// ─── System prompts ───────────────────────────────────────────────────────────

const SEGMENT_SYSTEM_PROMPT = `You are an expert at translating natural-language audience descriptions into structured segment conditions for an email marketing platform.

Available contact fields:
- email, phone (text)
- first_name, last_name (text)
- status: "active" | "unsubscribed" | "bounced" | "complained" | "pending"
- source (text)
- phone_type: "mobile" | "landline" | "voip" | "unknown"
- phone_status: "active" | "inactive" | "unknown" | "invalid"
- phone_operator (text, e.g. "T-Mobile", "O2", "Vodafone")
- phone_region, phone_district (text)
- phone_country (text, 2-letter ISO)
- phone_ported, phone_roaming (boolean)
- last_opened_at, last_clicked_at, created_at, updated_at (date)
- custom.{key} (custom fields, treat as text unless context says otherwise)

Tag operators: has_tag, not_has_tag (value = tag name)
Event operators: opened_campaign, not_opened_campaign, clicked_link, not_clicked_link (optional: withinDays: number)
Operators: eq, neq, gt, gte, lt, lte, contains, not_contains, starts_with, ends_with, in, not_in, is_set, is_not_set

Output ONLY valid JSON (no markdown, no explanation):
{
  operator: "AND" | "OR",
  rules: Array<{ field: string, op: string, value?: unknown, withinDays?: number }>,
  groups?: Array</* recursive */>,
  negate?: boolean
}`;

const EMAIL_GEN_SYSTEM_PROMPT = `You are an expert email copywriter specializing in high-converting marketing emails.

Generate email content in our block schema JSON format. Each block has a "type" and "content" field.

Block types:
- { type: "text", content: { html: "<p>...</p>" } }
- { type: "heading", content: { text: "...", level: 1|2|3 } }
- { type: "button", content: { text: "...", url: "{{cta_url}}", style: "primary"|"secondary" } }
- { type: "image", content: { src: "{{image_url}}", alt: "..." } }
- { type: "spacer", content: { height: 20 } }
- { type: "divider", content: {} }

Best practices: one clear CTA, mobile-first, personalize with {{first_name}} / {{company_name}}, subject under 50 chars, no spam triggers.

Output ONLY valid JSON (no markdown):
{ "subject": "...", "preheader": "...", "blocks": [Block, ...] }`;

const SUBJECT_LINE_SYSTEM_PROMPT = `You are an expert email marketing specialist who generates high-performing subject lines.

Generate exactly 5 subject line variants. For each, predict engagement score 1-10 and explain why.
Rules: max 50 chars, no spam triggers, variety of styles, include {{first_name}} in at least 2.

Output ONLY valid JSON (no markdown):
{ "variants": [{ "subject": "...", "score": 8, "reason": "..." }] }`;

const BRAND_VOICE_SYSTEM_PROMPT = `You are a brand voice analyst. Analyze the provided email campaign content and extract the brand's communication style.

Output ONLY valid JSON (no markdown):
{
  "tone": "...",
  "vocabulary": { "keyPhrases": ["..."], "readingLevel": "basic"|"intermediate"|"advanced", "avgWordsPerSentence": 12 },
  "ctaPatterns": { "actionWords": ["..."], "urgencyLevel": "low"|"medium"|"high" },
  "emojiUsage": "none"|"rare"|"moderate"|"frequent",
  "personalizationLevel": "none"|"basic"|"advanced",
  "brandValues": ["..."],
  "summary": "One paragraph description"
}`;

const CAMPAIGN_SUMMARY_SYSTEM_PROMPT = `You are an email marketing analyst. Given campaign statistics, write a concise natural-language performance report.

The report should:
1. Summarize key metrics (open rate, click rate, bounce rate) and compare to industry benchmarks
2. Identify top-performing links if available
3. Provide 2-3 specific, actionable recommendations to improve future campaigns
4. Be written in clear, professional English (2-4 paragraphs)

Output ONLY a JSON object (no markdown):
{
  "summary": "Narrative text with line breaks...",
  "highlights": ["Metric or achievement 1", "..."],
  "recommendations": ["Actionable recommendation 1", "...", "..."]
}`;

const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator specializing in marketing email content.

Translate the provided email blocks from the source language to the target language while:
1. Preserving ALL merge tags exactly as-is: {{first_name}}, {{company_name}}, {{unsubscribe_url}}, etc.
2. Preserving HTML tags and formatting (bold, italic, links)
3. Adapting idioms and cultural references appropriately for the target audience
4. Maintaining the tone and brand voice of the original

Input: JSON array of blocks. Each text/heading block has translatable text in content.html or content.text.
Output ONLY the translated blocks array as valid JSON (no markdown, same schema as input).`;

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── 1.10 Segment from description ──────────────────────────────────────

  app.post(
    '/api/v1/ai/segment-from-description',
    { schema: { tags: ['AI'], summary: 'Generate segment conditions from description' } },
    async (req) => {
      const { description } = z
        .object({ description: z.string().min(5).max(1000) })
        .parse(req.body);

      const orgId = req.user!.orgId;
      const key = cacheKey('segment', SEGMENT_SYSTEM_PROMPT.slice(0, 100), description);
      const cachedRaw = await redis.get(key);
      if (cachedRaw) {
        return { data: { conditions: JSON.parse(cachedRaw), _cached: true } };
      }

      const { text } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: SEGMENT_SYSTEM_PROMPT,
        user: description,
        maxTokens: 1024,
        feature: 'segment_from_description',
        tenantId: orgId,
        noCache: true, // manage cache manually for this one
      });

      let conditions: unknown;
      try {
        conditions = parseJsonSafe(text);
      } catch {
        throw AppError.internal(
          'AI returned an invalid response. Please rephrase your description.',
        );
      }

      const parsed = z
        .object({
          operator: z.enum(['AND', 'OR']),
          rules: z.array(z.object({ field: z.string(), op: z.string() }).passthrough()),
          groups: z.array(z.unknown()).optional(),
          negate: z.boolean().optional(),
        })
        .safeParse(conditions);

      if (!parsed.success)
        throw AppError.internal('AI returned an unrecognisable conditions structure');
      await redis.setex(key, CACHE_TTL, JSON.stringify(parsed.data));
      return { data: { conditions: parsed.data } };
    },
  );

  // ─── 4.5 AI email generator ──────────────────────────────────────────────

  app.post(
    '/api/v1/ai/generate-email',
    { schema: { tags: ['AI'], summary: 'Generate email content with AI' } },
    async (req) => {
      const body = z
        .object({
          goal: z.string().min(5).max(500),
          tone: z.enum(['formal', 'casual', 'urgent', 'friendly']).optional().default('friendly'),
          audienceDescription: z.string().max(500).optional().default(''),
          keyPoints: z.array(z.string().max(200)).max(10).optional().default([]),
          ctaText: z.string().max(100).optional().default('Learn More'),
          wordCountTarget: z.number().int().min(50).max(800).optional().default(200),
          brandVoice: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;
      const brandVoiceCtx = body.brandVoice
        ? `\n\nBrand voice:\n${JSON.stringify(body.brandVoice, null, 2)}`
        : '';

      const userPrompt = [
        `Goal: ${body.goal}`,
        `Tone: ${body.tone}`,
        `Audience: ${body.audienceDescription || 'general audience'}`,
        body.keyPoints.length > 0
          ? `Key points:\n${body.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
          : '',
        `CTA text: ${body.ctaText}`,
        `Target word count: ~${body.wordCountTarget} words`,
        brandVoiceCtx,
      ]
        .filter(Boolean)
        .join('\n');

      const { text, cached } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: EMAIL_GEN_SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 4096,
        feature: 'generate_email',
        tenantId: orgId,
      });

      let result: unknown;
      try {
        result = parseJsonSafe(text);
      } catch {
        throw AppError.internal('AI returned invalid email structure. Please try again.');
      }

      const parsed = z
        .object({
          subject: z.string(),
          preheader: z.string(),
          blocks: z.array(z.object({ type: z.string() }).passthrough()),
        })
        .safeParse(result);

      if (!parsed.success) throw AppError.internal('AI returned an unrecognisable email structure');
      return { data: { ...parsed.data, _cached: cached } };
    },
  );

  // ─── 4.6 Subject line generator ──────────────────────────────────────────

  app.post(
    '/api/v1/ai/subject-lines',
    { schema: { tags: ['AI'], summary: 'Generate subject line variants with scores' } },
    async (req) => {
      const body = z
        .object({
          emailContentSummary: z.string().min(10).max(1000),
          tone: z
            .enum(['formal', 'casual', 'urgent', 'friendly', 'curious'])
            .optional()
            .default('friendly'),
          audience: z.string().max(300).optional().default(''),
          brandVoice: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;
      const brandVoiceCtx = body.brandVoice
        ? `\n\nBrand voice:\n${JSON.stringify(body.brandVoice, null, 2)}`
        : '';

      const userPrompt = [
        `Email content summary: ${body.emailContentSummary}`,
        `Tone: ${body.tone}`,
        `Audience: ${body.audience || 'general audience'}`,
        brandVoiceCtx,
      ]
        .filter(Boolean)
        .join('\n');

      const { text, cached } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: SUBJECT_LINE_SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 1024,
        feature: 'subject_lines',
        tenantId: orgId,
      });

      let result: unknown;
      try {
        result = parseJsonSafe(text);
      } catch {
        throw AppError.internal('AI returned invalid subject line structure. Please try again.');
      }

      const parsed = z
        .object({
          variants: z
            .array(
              z.object({
                subject: z.string().max(100),
                score: z.number().min(1).max(10),
                reason: z.string(),
              }),
            )
            .min(1)
            .max(10),
        })
        .safeParse(result);

      if (!parsed.success)
        throw AppError.internal('AI returned unrecognisable subject line variants');

      // Enrich with historical open-rate signals (#538 subject scorer)
      const enriched = await enrichVariantsWithHistory(orgId, parsed.data.variants).catch(
        () => null,
      );

      return {
        data: {
          variants: enriched ?? parsed.data.variants,
          _cached: cached,
        },
      };
    },
  );

  // ─── 4.7 Brand voice analyzer ────────────────────────────────────────────

  app.post(
    '/api/v1/ai/analyze-brand-voice',
    { schema: { tags: ['AI'], summary: 'Analyze brand voice from past campaigns' } },
    async (req) => {
      const { campaignIds } = z
        .object({
          campaignIds: z.array(z.string().uuid()).min(1).max(20),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;
      const campaignRows = await db
        .select({ id: campaigns.id, subject: campaigns.subject, content: campaigns.content })
        .from(campaigns)
        .where(eq(campaigns.orgId, orgId));

      const filtered = campaignRows.filter((c) => campaignIds.includes(c.id));
      if (filtered.length === 0)
        throw AppError.badRequest('No matching campaigns found for the provided IDs');

      const corpus = filtered
        .map((c) => {
          const parts: string[] = [];
          if (c.subject) parts.push(`Subject: ${c.subject}`);
          if (c.content && typeof c.content === 'object') {
            const content = c.content as Record<string, unknown>;
            if (Array.isArray(content.blocks)) {
              for (const block of content.blocks as Array<Record<string, unknown>>) {
                const bc = block.content as Record<string, unknown> | undefined;
                if (bc?.html) parts.push(String(bc.html).replace(/<[^>]+>/g, ''));
                if (bc?.text) parts.push(String(bc.text));
              }
            }
          }
          return parts.join('\n');
        })
        .join('\n\n---\n\n')
        .slice(0, 8000);

      const { text, cached } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: BRAND_VOICE_SYSTEM_PROMPT,
        user: `Analyze the brand voice from these ${filtered.length} email campaigns:\n\n${corpus}`,
        maxTokens: 1024,
        feature: 'brand_voice',
        tenantId: orgId,
      });

      let brandVoice: unknown;
      try {
        brandVoice = parseJsonSafe(text);
      } catch {
        throw AppError.internal('AI returned invalid brand voice structure. Please try again.');
      }

      const brandVoiceSchema = z.object({
        tone: z.string(),
        vocabulary: z.object({
          keyPhrases: z.array(z.string()),
          readingLevel: z.enum(['basic', 'intermediate', 'advanced']),
          avgWordsPerSentence: z.number(),
        }),
        ctaPatterns: z.object({
          actionWords: z.array(z.string()),
          urgencyLevel: z.enum(['low', 'medium', 'high']),
        }),
        emojiUsage: z.enum(['none', 'rare', 'moderate', 'frequent']),
        personalizationLevel: z.enum(['none', 'basic', 'advanced']),
        brandValues: z.array(z.string()),
        summary: z.string(),
      });

      const parsed = brandVoiceSchema.safeParse(brandVoice);
      if (!parsed.success)
        throw AppError.internal('AI returned unrecognisable brand voice structure');

      await db
        .update(organizations)
        .set({ settings: { brandVoice: parsed.data } } as never)
        .where(eq(organizations.id, orgId));

      return { data: { brandVoice: parsed.data, _cached: cached } };
    },
  );

  // ─── 4.8 AI campaign summary ─────────────────────────────────────────────

  app.post(
    '/api/v1/ai/campaign-summary',
    { schema: { tags: ['AI'], summary: 'Generate AI campaign performance summary' } },
    async (req) => {
      const body = z
        .object({
          campaignStats: z.object({
            sent: z.number(),
            delivered: z.number(),
            deliveryRate: z.number(),
            opens: z.number(),
            uniqueOpens: z.number(),
            openRate: z.number(),
            clicks: z.number(),
            uniqueClicks: z.number(),
            clickRate: z.number(),
            ctor: z.number(),
            bounces: z.number(),
            bounceRate: z.number(),
            unsubs: z.number(),
            unsubRate: z.number(),
            complaints: z.number(),
            complaintRate: z.number(),
          }),
          /** Optional extra context for the report */
          campaignName: z.string().max(255).optional(),
          topLinks: z
            .array(z.object({ url: z.string(), clicks: z.number() }))
            .max(5)
            .optional(),
          orgAverages: z
            .object({
              openRate: z.number(),
              clickRate: z.number(),
              bounceRate: z.number(),
            })
            .optional(),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;

      const statsText = [
        body.campaignName ? `Campaign: ${body.campaignName}` : '',
        `Sent: ${body.campaignStats.sent} | Delivered: ${body.campaignStats.delivered} (${body.campaignStats.deliveryRate}%)`,
        `Opens: ${body.campaignStats.uniqueOpens} unique (${body.campaignStats.openRate}% open rate)`,
        `Clicks: ${body.campaignStats.uniqueClicks} unique (${body.campaignStats.clickRate}% click rate, ${body.campaignStats.ctor}% CTOR)`,
        `Bounces: ${body.campaignStats.bounces} (${body.campaignStats.bounceRate}%)`,
        `Unsubscribes: ${body.campaignStats.unsubs} (${body.campaignStats.unsubRate}%)`,
        `Complaints: ${body.campaignStats.complaints} (${body.campaignStats.complaintRate}%)`,
        body.orgAverages
          ? `Org averages: open ${body.orgAverages.openRate}%, click ${body.orgAverages.clickRate}%, bounce ${body.orgAverages.bounceRate}%`
          : '',
        body.topLinks && body.topLinks.length > 0
          ? `Top links:\n${body.topLinks.map((l, i) => `  ${i + 1}. ${l.url} (${l.clicks} clicks)`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const { text, cached } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: CAMPAIGN_SUMMARY_SYSTEM_PROMPT,
        user: statsText,
        maxTokens: 1024,
        feature: 'campaign_summary',
        tenantId: orgId,
      });

      let result: unknown;
      try {
        result = parseJsonSafe(text);
      } catch {
        throw AppError.internal('AI returned invalid summary structure. Please try again.');
      }

      const parsed = z
        .object({
          summary: z.string(),
          highlights: z.array(z.string()).min(1).max(10),
          recommendations: z.array(z.string()).min(1).max(5),
        })
        .safeParse(result);

      if (!parsed.success) throw AppError.internal('AI returned unrecognisable summary structure');
      return { data: { ...parsed.data, _cached: cached } };
    },
  );

  // ─── 4.9 AI translation ──────────────────────────────────────────────────

  app.post(
    '/api/v1/ai/translate',
    { schema: { tags: ['AI'], summary: 'Translate email blocks to target language' } },
    async (req) => {
      const body = z
        .object({
          blocks: z
            .array(z.object({ type: z.string() }).passthrough())
            .min(1)
            .max(100),
          sourceLang: z.string().min(2).max(10).optional().default('auto'),
          targetLang: z.string().min(2).max(10),
          brandVoice: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;

      const blocksJson = JSON.stringify(body.blocks, null, 2);

      const brandVoiceCtx = body.brandVoice
        ? `\n\nBrand voice to maintain:\n${JSON.stringify(body.brandVoice)}`
        : '';

      const userPrompt = [
        `Source language: ${body.sourceLang}`,
        `Target language: ${body.targetLang}`,
        brandVoiceCtx,
        `\nTranslate ONLY the text content in these blocks (preserve structure, merge tags, HTML tags):`,
        blocksJson,
      ].join('\n');

      const { text, cached } = await callClaude({
        model: 'claude-sonnet-4-6',
        system: TRANSLATE_SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 8192,
        feature: 'translate',
        tenantId: orgId,
      });

      let translatedBlocks: unknown;
      try {
        translatedBlocks = parseJsonSafe(text);
      } catch {
        throw AppError.internal('AI returned invalid translated blocks. Please try again.');
      }

      const parsed = z
        .array(z.object({ type: z.string() }).passthrough())
        .safeParse(translatedBlocks);

      if (!parsed.success)
        throw AppError.internal('AI returned unrecognisable blocks structure after translation');

      // Verify merge tags were preserved (basic check)
      const originalTags = [...blocksJson.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]);
      const translatedJson = JSON.stringify(parsed.data);
      const missingTags = originalTags.filter((tag) => !translatedJson.includes(tag));

      return {
        data: {
          blocks: parsed.data,
          targetLang: body.targetLang,
          _cached: cached,
          _warnings:
            missingTags.length > 0
              ? [
                  `${missingTags.length} merge tag(s) may be missing: ${missingTags.slice(0, 3).join(', ')}`,
                ]
              : [],
        },
      };
    },
  );

  // ─── 4.11 AI usage stats ─────────────────────────────────────────────────

  app.get(
    '/api/v1/ai/usage',
    { schema: { tags: ['AI'], summary: 'Get AI usage statistics for the org' } },
    async (req) => {
      const query = z
        .object({
          days: z.string().optional().default('30'),
        })
        .parse(req.query);

      const orgId = req.user!.orgId;
      const days = Math.min(parseInt(query.days, 10) || 30, 365);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const rows = await db.execute(sql`
        SELECT
          feature,
          COUNT(*) AS calls,
          SUM(input_tokens) AS total_input_tokens,
          SUM(output_tokens) AS total_output_tokens,
          SUM(cost_usd::numeric) AS total_cost_usd,
          COUNT(*) FILTER (WHERE cached = 'true') AS cached_calls
        FROM ai_usage
        WHERE org_id = ${orgId}
          AND created_at >= ${since.toISOString()}
        GROUP BY feature
        ORDER BY total_cost_usd DESC
      `);

      const totals = await db.execute(sql`
        SELECT
          COUNT(*) AS total_calls,
          SUM(input_tokens) AS total_input_tokens,
          SUM(output_tokens) AS total_output_tokens,
          SUM(cost_usd::numeric) AS total_cost_usd
        FROM ai_usage
        WHERE org_id = ${orgId}
          AND created_at >= ${since.toISOString()}
      `);

      return {
        data: {
          period: { days, since: since.toISOString() },
          totals: totals[0] ?? { total_calls: 0, total_cost_usd: '0' },
          byFeature: rows,
        },
      };
    },
  );
}
