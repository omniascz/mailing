/**
 * Twilio Media Streams bridge — connects a live phone call to the real
 * Deepgram(STT) → Claude(LLM) → ElevenLabs(TTS) pipeline.
 *
 * Twilio opens a WebSocket (via TwiML <Connect><Stream url="wss://.../twilio">)
 * and exchanges JSON frames carrying base64 μ-law 8kHz audio. We pass μ-law
 * straight through: Deepgram accepts encoding=mulaw and ElevenLabs emits
 * output_format=ulaw_8000, so there is NO codec/resample step.
 *
 *   Twilio → us:  connected | start | media{payload} | mark | stop
 *   us → Twilio:  media{payload} | mark{name} | clear   (clear = flush on barge-in)
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { createDeepgramStt } from '../adapters/deepgram.js';
import { createElevenLabsTts } from '../adapters/elevenlabs.js';
import { createClaudeLlm } from '../adapters/claude.js';
import type { SttStream } from './streaming.js';

const TWILIO_FRAME_BYTES = 160; // 20ms of μ-law @ 8kHz

/** Split a μ-law buffer into Twilio-sized (20ms) frames. Pure + testable. */
export function chunkUlaw(buf: Buffer, size = TWILIO_FRAME_BYTES): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size));
  return out;
}

/** Build a Twilio outbound media frame. Pure + testable. */
export function mediaFrame(streamSid: string, payloadB64: string): string {
  return JSON.stringify({ event: 'media', streamSid, media: { payload: payloadB64 } });
}

export interface TwilioBridgeOptions {
  deepgramKey: string;
  elevenLabsKey: string;
  anthropicKey: string;
  port?: number;
  language?: string;
  voiceId?: string;
  systemPrompt?: string;
  llmModel?: string;
  elevenLabsModelId?: string;
}

interface CallState {
  ws: WebSocket;
  streamSid: string;
  transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stt: SttStream | null;
  ttsAbort: AbortController | null;
  speaking: boolean;
}

export function createTwilioBridge(opts: TwilioBridgeOptions): {
  wss: WebSocketServer;
  close: () => Promise<void>;
} {
  const port = opts.port ?? 8788;
  const language = opts.language ?? 'cs';
  const voiceId = opts.voiceId ?? '21m00Tcm4TlvDq8ikWAM';
  const systemPrompt =
    opts.systemPrompt ??
    'You are a helpful phone assistant. Reply in short, natural spoken sentences.';

  const stt = createDeepgramStt(opts.deepgramKey, { encoding: 'mulaw' });
  const tts = createElevenLabsTts(opts.elevenLabsKey, {
    outputFormat: 'ulaw_8000',
    modelId: opts.elevenLabsModelId,
  });
  const llm = createClaudeLlm(opts.anthropicKey, opts.llmModel ?? 'claude-haiku-4-5-20251001');

  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const state: CallState = {
      ws,
      streamSid: '',
      transcript: [{ role: 'system', content: systemPrompt }],
      stt: null,
      ttsAbort: null,
      speaking: false,
    };

    const sendClear = () => {
      if (state.streamSid && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ event: 'clear', streamSid: state.streamSid }));
      }
    };

    const speak = async (text: string) => {
      const abort = new AbortController();
      state.ttsAbort = abort;
      state.speaking = true;
      try {
        for await (const chunk of tts.stream({ text, voiceId, signal: abort.signal })) {
          if (abort.signal.aborted) break;
          for (const frame of chunkUlaw(chunk.pcm)) {
            if (abort.signal.aborted) break;
            if (ws.readyState === ws.OPEN) {
              ws.send(mediaFrame(state.streamSid, frame.toString('base64')));
            }
          }
        }
      } catch {
        /* TTS error — drop this utterance, keep the call alive */
      } finally {
        state.speaking = false;
      }
    };

    const runTurn = async (userText: string) => {
      state.transcript.push({ role: 'user', content: userText });
      const abort = new AbortController();
      state.ttsAbort = abort;
      let sentence = '';
      let full = '';
      try {
        for await (const { delta, done } of llm.stream({
          orgId: '',
          sessionId: state.streamSid,
          messages: state.transcript,
          signal: abort.signal,
        })) {
          if (abort.signal.aborted) return;
          if (delta) {
            sentence += delta;
            full += delta;
            const b = sentence.search(/[.!?…]\s|[\n\r]/);
            if (b >= 0) {
              const ready = sentence.slice(0, b + 1).trim();
              sentence = sentence.slice(b + 1);
              if (ready) await speak(ready);
            }
          }
          if (done) break;
        }
        if (sentence.trim()) await speak(sentence.trim());
      } catch {
        /* LLM error — stay on the call */
      }
      if (full.trim()) state.transcript.push({ role: 'assistant', content: full });
    };

    const pumpStt = async () => {
      if (!state.stt) return;
      for await (const evt of state.stt.events) {
        if (evt.type === 'partial' && state.speaking) {
          // Barge-in: caller started talking over the bot — flush + cancel TTS.
          state.ttsAbort?.abort();
          sendClear();
        } else if (evt.type === 'final' && evt.text.trim()) {
          void runTurn(evt.text);
        }
      }
    };

    ws.on('message', (raw: Buffer) => {
      let msg: { event?: string; start?: { streamSid?: string }; media?: { payload?: string } };
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (msg.event === 'start') {
        state.streamSid = msg.start?.streamSid ?? '';
        state.stt = stt.open({ sampleRate: 8000, language });
        void pumpStt();
      } else if (msg.event === 'media') {
        const payload = msg.media?.payload;
        if (payload && state.stt) state.stt.pushAudio(Buffer.from(payload, 'base64'));
      } else if (msg.event === 'stop') {
        state.stt?.finalize();
      }
    });

    ws.on('close', () => {
      state.ttsAbort?.abort();
      state.stt?.close();
    });
  });

  return {
    wss,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}
