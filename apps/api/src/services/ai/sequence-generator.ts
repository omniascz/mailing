/**
 * AI Campaign Sequence Generator.
 * From a single goal description, generates a full multi-step sequence with
 * email copy, timing, and channel recommendations for each step.
 */
import { callClaude } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';
import { getActiveBrandVoice, buildBrandVoiceContext } from './brand-voice.js';

const SYSTEM = `You are an expert email marketing strategist. Generate a complete multi-step campaign sequence based on the user's goal.
Each step should have specific copy, timing, and channel recommendations.
Output ONLY valid JSON:
{
  "name": "Sequence name",
  "description": "What this sequence achieves",
  "steps": [
    {
      "stepNumber": 1,
      "type": "email|sms|wait|task",
      "delayDays": 0,
      "subject": "...",
      "preheader": "...",
      "bodyText": "Plain text email body with {{first_name}} etc.",
      "bodyHtml": "<p>HTML version</p>",
      "smsText": "SMS text (if type=sms, max 160 chars)",
      "rationale": "Why this step at this timing"
    }
  ],
  "exitOnReply": true,
  "estimatedDurationDays": 14,
  "expectedConversionRate": "3-5%"
}`;

export interface GeneratedSequence {
  name: string;
  description: string;
  steps: Array<{
    stepNumber: number;
    type: 'email' | 'sms' | 'wait' | 'task';
    delayDays: number;
    subject?: string;
    preheader?: string;
    bodyText?: string;
    bodyHtml?: string;
    smsText?: string;
    rationale: string;
  }>;
  exitOnReply: boolean;
  estimatedDurationDays: number;
  expectedConversionRate: string;
}

export async function generateSequenceFromGoal(
  orgId: string,
  opts: {
    goal: string;
    numSteps?: number;
    audienceDescription?: string;
    channels?: Array<'email' | 'sms'>;
    useBrandVoice?: boolean;
  },
): Promise<GeneratedSequence> {
  const cacheKey = `seq-gen:${orgId}:${opts.goal.slice(0, 50)}:${opts.numSteps ?? 5}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as GeneratedSequence;

  const brandVoice = opts.useBrandVoice ? await getActiveBrandVoice(orgId) : null;
  const bvCtx = buildBrandVoiceContext(brandVoice);

  const userPrompt = [
    `Goal: ${opts.goal}`,
    `Desired number of steps: ${opts.numSteps ?? 5}`,
    `Target audience: ${opts.audienceDescription ?? 'general subscribers'}`,
    `Available channels: ${(opts.channels ?? ['email']).join(', ')}`,
    bvCtx,
  ]
    .filter(Boolean)
    .join('\n');

  const { text } = await callClaude({
    model: 'claude-sonnet-4-6',
    system: SYSTEM,
    user: userPrompt,
    maxTokens: 4096,
    feature: 'generate_email',
    tenantId: orgId,
  });

  let result: GeneratedSequence;
  try {
    result = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as GeneratedSequence;
    if (!Array.isArray(result.steps) || result.steps.length === 0) throw new Error('Empty steps');
  } catch {
    throw AppError.internal('AI returned invalid sequence structure');
  }

  await redis.setex(cacheKey, 3600 * 6, JSON.stringify(result));
  return result;
}
