import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { brandVoiceProfiles, type BrandVoiceProfile } from '../../db/schema/brand-voice.js';
import { callClaude } from '../../lib/ai-client.js';
import { AppError } from '../../lib/app-error.js';

const EXTRACT_SYSTEM = `You are a brand voice analyst. Analyze email campaign content and extract the brand's communication style.
Output ONLY valid JSON:
{
  "tone": "professional|conversational|playful|authoritative|empathetic",
  "vocabulary": { "keyPhrases": ["..."], "readingLevel": "basic|intermediate|advanced", "avgWordsPerSentence": 12 },
  "ctaPatterns": { "actionWords": ["..."], "urgencyLevel": "low|medium|high" },
  "emojiUsage": "none|rare|moderate|frequent",
  "personalizationLevel": "none|basic|advanced",
  "brandValues": ["..."],
  "summary": "One paragraph description"
}`;

export async function extractAndSaveBrandVoice(
  orgId: string,
  name: string,
  samples: string[],
): Promise<BrandVoiceProfile> {
  if (samples.length === 0) throw AppError.badRequest('Provide at least one sample');

  const userPrompt = `Analyze these ${samples.length} email samples and extract the brand voice:\n\n${samples.map((s, i) => `--- Sample ${i + 1} ---\n${s}`).join('\n\n')}`;

  const { text } = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    system: EXTRACT_SYSTEM,
    user: userPrompt,
    maxTokens: 1024,
    feature: 'brand_voice',
    tenantId: orgId,
  });

  let profile: BrandVoiceProfile;
  try {
    profile = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as BrandVoiceProfile;
  } catch {
    throw AppError.internal('AI returned invalid brand voice structure');
  }

  const [row] = await db
    .insert(brandVoiceProfiles)
    .values({ orgId, name, profile, samplesUsed: samples.slice(0, 5) })
    .returning();
  return row!.profile;
}

export async function getActiveBrandVoice(orgId: string): Promise<BrandVoiceProfile | null> {
  const [row] = await db
    .select()
    .from(brandVoiceProfiles)
    .where(and(eq(brandVoiceProfiles.orgId, orgId), eq(brandVoiceProfiles.active, true)))
    .orderBy(desc(brandVoiceProfiles.updatedAt))
    .limit(1);
  return row?.profile ?? null;
}

export async function listBrandVoiceProfiles(orgId: string) {
  return db
    .select({ id: brandVoiceProfiles.id, name: brandVoiceProfiles.name, active: brandVoiceProfiles.active, createdAt: brandVoiceProfiles.createdAt })
    .from(brandVoiceProfiles)
    .where(eq(brandVoiceProfiles.orgId, orgId))
    .orderBy(desc(brandVoiceProfiles.createdAt));
}

export async function setActiveBrandVoice(orgId: string, profileId: string): Promise<void> {
  await db.update(brandVoiceProfiles).set({ active: false }).where(eq(brandVoiceProfiles.orgId, orgId));
  await db.update(brandVoiceProfiles).set({ active: true, updatedAt: new Date() })
    .where(and(eq(brandVoiceProfiles.id, profileId), eq(brandVoiceProfiles.orgId, orgId)));
}

export async function deleteBrandVoiceProfile(orgId: string, profileId: string): Promise<void> {
  await db.delete(brandVoiceProfiles)
    .where(and(eq(brandVoiceProfiles.id, profileId), eq(brandVoiceProfiles.orgId, orgId)));
}

/** Inject active brand voice into AI email generation prompt context */
export function buildBrandVoiceContext(profile: BrandVoiceProfile | null): string {
  if (!profile) return '';
  return `\n\nBrand voice:\n- Tone: ${profile.tone}\n- Reading level: ${profile.vocabulary.readingLevel}\n- Key phrases: ${profile.vocabulary.keyPhrases.slice(0, 5).join(', ')}\n- CTA action words: ${profile.ctaPatterns.actionWords.slice(0, 5).join(', ')}\n- Emoji usage: ${profile.emojiUsage}\n- Brand values: ${profile.brandValues.join(', ')}\n- Style summary: ${profile.summary}`;
}
