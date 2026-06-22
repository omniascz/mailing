/**
 * Adapter factory: returns real Deepgram/ElevenLabs/Claude adapters when their
 * API keys are configured, otherwise falls back to the echo/silence stubs so the
 * wire protocol still works in dev/tests.
 */
import {
  createStubAdapters,
  type SttAdapter,
  type LlmAdapter,
  type TtsAdapter,
} from '../api/streaming.js';
import { createDeepgramStt } from './deepgram.js';
import { createElevenLabsTts } from './elevenlabs.js';
import { createClaudeLlm } from './claude.js';

export interface ResolvedAdapters {
  stt: SttAdapter;
  llm: LlmAdapter;
  tts: TtsAdapter;
  /** Which of the three are running real providers (vs stub). */
  mode: { stt: 'real' | 'stub'; llm: 'real' | 'stub'; tts: 'real' | 'stub' };
}

export function resolveAdapters(): ResolvedAdapters {
  const stub = createStubAdapters();
  const dgKey = process.env.DEEPGRAM_API_KEY;
  const elKey = process.env.ELEVENLABS_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  return {
    stt: dgKey ? createDeepgramStt(dgKey, process.env.DEEPGRAM_MODEL ?? 'nova-2') : stub.stt,
    llm: anthropicKey
      ? createClaudeLlm(anthropicKey, process.env.VOICE_BOT_LLM_MODEL ?? 'claude-haiku-4-5-20251001')
      : stub.llm,
    tts: elKey
      ? createElevenLabsTts(elKey, process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2')
      : stub.tts,
    mode: {
      stt: dgKey ? 'real' : 'stub',
      llm: anthropicKey ? 'real' : 'stub',
      tts: elKey ? 'real' : 'stub',
    },
  };
}
