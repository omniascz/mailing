/**
 * Call transcription & AI summary service (#252).
 *
 * Transcription providers (in order of preference):
 *   1. Deepgram Nova-2 (best accuracy for phone audio)
 *   2. OpenAI Whisper (fallback)
 *
 * After transcription, Claude Haiku produces a structured call summary.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/calls.js';
import { callClaude } from '../../lib/ai-client.js';
import { AppError } from '../../lib/app-error.js';

export interface TranscriptionResult {
  callId: string;
  transcript: string;
  summary: CallSummary;
  provider: string;
  tokensUsed: number;
}

export interface CallSummary {
  outcome: 'resolved' | 'escalated' | 'callback_needed' | 'no_answer' | 'other';
  keyPoints: string[];
  actionItems: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  duration?: number;
}

const SUMMARY_PROMPT = `You are an expert call analyst. Summarize this phone call transcript into structured JSON.
Output ONLY valid JSON with schema:
{ "outcome": "resolved"|"escalated"|"callback_needed"|"no_answer"|"other", "keyPoints": string[], "actionItems": string[], "sentiment": "positive"|"neutral"|"negative" }`;

// ─── Transcribe from URL ──────────────────────────────────────────────────────

export async function transcribeCall(
  orgId: string,
  callId: string,
  audioUrl: string,
): Promise<TranscriptionResult> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) throw AppError.notFound('Call');

  // Step 1: Transcription
  const { transcript, provider } = await transcribeAudio(audioUrl);

  // Step 2: AI summary via Claude
  const { summary, tokensUsed } = await summarizeTranscript(orgId, transcript);

  // Step 3: Persist
  await db.update(calls)
    .set({
      transcript,
      aiSummary: summary.keyPoints.join('\n'),
      outcome: summary as unknown as Record<string, unknown>,
    })
    .where(eq(calls.id, callId));

  return { callId, transcript, summary, provider, tokensUsed };
}

async function transcribeAudio(audioUrl: string): Promise<{ transcript: string; provider: string }> {
  // Try Deepgram first
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (dgKey) {
    try {
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true', {
        method: 'POST',
        headers: {
          Authorization: `Token ${dgKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
        };
        const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        if (transcript) return { transcript, provider: 'deepgram' };
      }
    } catch { /* fall through */ }
  }

  // Fallback: OpenAI Whisper
  const oaiKey = process.env.OPENAI_API_KEY;
  if (oaiKey) {
    try {
      // Whisper requires the audio file, not a URL — fetch then upload
      const audioRes = await fetch(audioUrl);
      if (audioRes.ok) {
        const blob = await audioRes.blob();
        const form = new FormData();
        form.append('file', blob, 'recording.mp3');
        form.append('model', 'whisper-1');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${oaiKey}` },
          body: form,
        });
        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          if (data.text) return { transcript: data.text, provider: 'whisper' };
        }
      }
    } catch { /* fall through */ }
  }

  return { transcript: '[Transcription unavailable]', provider: 'none' };
}

async function summarizeTranscript(
  orgId: string,
  transcript: string,
): Promise<{ summary: CallSummary; tokensUsed: number }> {
  if (!transcript || transcript === '[Transcription unavailable]') {
    return {
      summary: { outcome: 'other', keyPoints: [], actionItems: [], sentiment: 'neutral' },
      tokensUsed: 0,
    };
  }

  try {
    const result = await callClaude({
      tenantId: orgId,
      system: SUMMARY_PROMPT,
      user: `Transcript:\n${transcript.slice(0, 8000)}`,
      model: 'claude-haiku-4-5-20251001',
      feature: 'other',
      maxTokens: 512,
    });

    const summary = JSON.parse(result.text) as CallSummary;
    return { summary, tokensUsed: (result.inputTokens + result.outputTokens) };
  } catch {
    return {
      summary: { outcome: 'other', keyPoints: [transcript.slice(0, 200)], actionItems: [], sentiment: 'neutral' },
      tokensUsed: 0,
    };
  }
}
