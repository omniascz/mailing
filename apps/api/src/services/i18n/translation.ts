/**
 * Multi-language content service (#338).
 *
 * Groups a family of localised templates / saved-blocks by
 * `translation_group_id`. The group acts as the "logical" entity; each row is
 * one locale variant.
 *
 * Public surface:
 *   - `createTranslationGroup(orgId)` — mint a new UUID, nothing persisted.
 *   - `getTemplateGroup(orgId, groupId)` — all locale variants for a logical
 *     template.
 *   - `selectTemplateForLocale(orgId, groupId, locale)` — exact match → base
 *     language fallback → first row; used by campaign sending to pick the
 *     right template per recipient.
 *   - `translateTemplate(orgId, templateId, targetLocale)` — Claude-driven
 *     translation of the template's subject, preheader and block text-nodes,
 *     writing a new row in the same group.
 *
 * Block translation is shallow and conservative: it only rewrites
 * `text`/`content`/`html`/`subject`/`altText` keys and never changes
 * structure, links or images.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates, type Template } from '../../db/schema/templates.js';
import { callClaude, parseJsonSafe } from '../../lib/ai-client.js';
import { AppError } from '../../lib/app-error.js';
import { randomUUID } from 'node:crypto';

const TEXT_KEYS = new Set([
  'text',
  'content',
  'html',
  'altText',
  'buttonText',
  'subject',
  'preheader',
  'label',
  'heading',
  'title',
  'caption',
]);

export function createTranslationGroup(): string {
  return randomUUID();
}

export async function getTemplateGroup(orgId: string, groupId: string): Promise<Template[]> {
  return db
    .select()
    .from(templates)
    .where(and(eq(templates.orgId, orgId), eq(templates.translationGroupId, groupId)));
}

export async function selectTemplateForLocale(
  orgId: string,
  groupId: string,
  locale: string,
): Promise<Template | null> {
  const rows = await getTemplateGroup(orgId, groupId);
  if (rows.length === 0) return null;
  const exact = rows.find((t) => t.locale === locale);
  if (exact) return exact;
  const base = locale.split('-')[0]!;
  const partial = rows.find((t) => t.locale === base || t.locale.startsWith(`${base}-`));
  return partial ?? rows[0]!;
}

/**
 * Walk the blocks tree and collect every translatable string keyed by a
 * stable JSON-pointer-ish path. Returns a flat map the caller can send to
 * Claude and then apply back.
 */
function collectStrings(node: unknown, path: string, out: Map<string, string>): void {
  if (node == null) return;
  if (typeof node === 'string') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, `${path}/${i}`, out));
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const child = `${path}/${k}`;
      if (typeof v === 'string' && TEXT_KEYS.has(k) && v.trim().length > 0) {
        out.set(child, v);
      } else if (v && typeof v === 'object') {
        collectStrings(v, child, out);
      }
    }
  }
}

function applyTranslations(node: unknown, path: string, map: Map<string, string>): unknown {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((v, i) => applyTranslations(v, `${path}/${i}`, map));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const child = `${path}/${k}`;
    if (typeof v === 'string' && map.has(child)) {
      out[k] = map.get(child)!;
    } else if (v && typeof v === 'object') {
      out[k] = applyTranslations(v, child, map);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface TranslateResult {
  templateId: string;
  targetLocale: string;
  stringsTranslated: number;
  tokensUsed: number;
}

export async function translateTemplate(
  orgId: string,
  templateId: string,
  targetLocale: string,
  opts?: { sourceLocale?: string; tone?: string },
): Promise<TranslateResult> {
  const [source] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.orgId, orgId)))
    .limit(1);
  if (!source) throw AppError.notFound('Template not found');
  if (source.locale === targetLocale) {
    throw AppError.badRequest('Target locale equals source locale');
  }

  const groupId = source.translationGroupId ?? createTranslationGroup();
  if (!source.translationGroupId) {
    await db
      .update(templates)
      .set({ translationGroupId: groupId })
      .where(eq(templates.id, source.id));
  }

  // Avoid double-translating if a row for this locale already exists.
  const existing = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.orgId, orgId),
        eq(templates.translationGroupId, groupId),
        eq(templates.locale, targetLocale),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return {
      templateId: existing[0].id,
      targetLocale,
      stringsTranslated: 0,
      tokensUsed: 0,
    };
  }

  const strings = new Map<string, string>();
  if (source.subject) strings.set('/subject', source.subject);
  if (source.preheader) strings.set('/preheader', source.preheader);
  collectStrings(source.blocks, '/blocks', strings);

  if (strings.size === 0) {
    throw AppError.badRequest('Template has no translatable strings');
  }

  const entries = [...strings.entries()];
  const payload = Object.fromEntries(entries);
  const sourceLocale = opts?.sourceLocale ?? source.locale;

  const llm = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'translate',
    system: `You are a professional email-marketing translator. You translate from ${sourceLocale} to ${targetLocale}. Preserve tone, merge tags like {{first_name}} or %FIRST_NAME% exactly, preserve HTML tags and attributes, never translate brand names, prices, or URLs. Output strict JSON only.`,
    user: `Translate every value from ${sourceLocale} to ${targetLocale}. Keep the same keys, return JSON of the same shape.${opts?.tone ? ` Tone: ${opts.tone}.` : ''}

Input:
${JSON.stringify(payload, null, 2)}

Output: JSON object with identical keys and translated string values. No comments, no markdown fences.`,
    maxTokens: Math.min(4096, Math.ceil(JSON.stringify(payload).length * 2)),
  });

  const translated = parseJsonSafe<Record<string, string>>(llm.text);
  if (!translated) throw AppError.internal('Translation LLM returned invalid JSON');

  const translatedMap = new Map<string, string>();
  for (const [path] of entries) {
    const v = translated[path];
    if (typeof v === 'string' && v.length > 0) translatedMap.set(path, v);
  }

  const newSubject = translatedMap.get('/subject') ?? source.subject;
  const newPreheader = translatedMap.get('/preheader') ?? source.preheader;
  const newBlocks = applyTranslations(source.blocks, '/blocks', translatedMap) as unknown[];

  const [inserted] = await db
    .insert(templates)
    .values({
      orgId: source.orgId,
      name: `${source.name} (${targetLocale})`,
      description: source.description,
      category: source.category,
      thumbnailUrl: source.thumbnailUrl,
      subject: newSubject,
      preheader: newPreheader,
      blocks: newBlocks,
      globalStyles: source.globalStyles,
      isPublic: source.isPublic,
      tags: source.tags,
      locale: targetLocale,
      translationGroupId: groupId,
    })
    .returning();

  if (!inserted) throw AppError.internal('Failed to insert translated template');

  return {
    templateId: inserted.id,
    targetLocale,
    stringsTranslated: translatedMap.size,
    tokensUsed: llm.inputTokens + llm.outputTokens,
  };
}
