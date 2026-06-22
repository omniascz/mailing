/**
 * ElevenLabs streaming TTS adapter (real).
 * Streams PCM audio chunks for a sentence using the /stream endpoint.
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-as-stream
 */
import type { TtsAdapter } from '../api/streaming.js';

const SUPPORTED_PCM = [16000, 22050, 24000, 44100];

function pcmFormat(sampleRate?: number): { fmt: string; sr: number } {
  const sr = SUPPORTED_PCM.includes(sampleRate ?? 0) ? sampleRate! : 24000;
  return { fmt: `pcm_${sr}`, sr };
}

export interface ElevenLabsOpts {
  modelId?: string;
  /** 'ulaw_8000' for Twilio Media Streams (μ-law passthrough); else PCM. */
  outputFormat?: 'pcm' | 'ulaw_8000';
}

export function createElevenLabsTts(
  apiKey: string,
  opts: ElevenLabsOpts | string = {},
): TtsAdapter {
  // Back-compat: a bare string is treated as the model id.
  const o: ElevenLabsOpts = typeof opts === 'string' ? { modelId: opts } : opts;
  const modelId = o.modelId ?? 'eleven_multilingual_v2';
  return {
    async *stream({ text, voiceId, sampleRate, signal }) {
      if (!text.trim()) return;
      const { fmt, sr } =
        o.outputFormat === 'ulaw_8000' ? { fmt: 'ulaw_8000', sr: 8000 } : pcmFormat(sampleRate);
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        voiceId,
      )}/stream?output_format=${fmt}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/pcm',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const detail = res.ok ? 'no body' : `${res.status} ${await res.text().catch(() => '')}`;
        throw new Error(`ElevenLabs TTS failed: ${detail}`);
      }

      // Stream raw PCM bytes as they arrive.
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) break;
          if (value && value.byteLength > 0) {
            yield { pcm: Buffer.from(value), sampleRate: sr };
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
