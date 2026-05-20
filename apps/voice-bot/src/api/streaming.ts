/**
 * Low-latency streaming API for conversational voice agents.
 *
 * Target: < 200ms end-to-end latency from final user utterance →
 *          first audio frame of assistant reply.
 *
 * Protocol — WebSocket, JSON frames:
 *
 *   Client → server:
 *     { "type": "start",   "orgId": "...", "sessionId": "...", "sampleRate": 16000,
 *       "language": "cs", "voiceId": "...", "systemPrompt"?: "..." }
 *     { "type": "audio",   "pcm":    "<base64 PCM 16-bit mono>" }
 *     { "type": "text",    "content": "..." }          // bypass STT
 *     { "type": "barge_in" }                            // user interrupted TTS
 *     { "type": "end" }
 *
 *   Server → client:
 *     { "type": "ready", "sessionId": "...", "latencyHint": 180 }
 *     { "type": "stt_partial",  "text": "...", "endOfSpeech": false }
 *     { "type": "stt_final",    "text": "..." }
 *     { "type": "llm_delta",    "text": "..." }        // incremental tokens
 *     { "type": "tts_chunk",    "pcm":  "<base64>", "sampleRate": 24000 }
 *     { "type": "utterance_end" }
 *     { "type": "error",        "code": "...", "message": "..." }
 *
 * This module is provider-agnostic: concrete STT / LLM / TTS adapters are
 * injected via `createStreamingServer({ stt, llm, tts })`. Adapters only
 * need to expose async-iterable streams.
 */

import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export interface SttAdapter {
  /** Start a streaming recognizer; push PCM in, get partials + finals out. */
  open(opts: { sampleRate: number; language: string }): SttStream;
}

export interface SttStream {
  pushAudio(pcm: Buffer): void;
  finalize(): void;
  events: AsyncIterable<{ type: 'partial' | 'final'; text: string; endOfSpeech?: boolean }>;
  close(): void;
}

export interface LlmAdapter {
  /** Stream assistant tokens given the running conversation transcript. */
  stream(opts: {
    orgId: string;
    sessionId: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    signal?: AbortSignal;
  }): AsyncIterable<{ delta: string; done?: boolean }>;
}

export interface TtsAdapter {
  /** Stream TTS audio chunks for the given text. */
  stream(opts: {
    text: string;
    voiceId: string;
    sampleRate?: number;
    signal?: AbortSignal;
  }): AsyncIterable<{ pcm: Buffer; sampleRate: number }>;
}

export interface StreamingServerOptions {
  stt: SttAdapter;
  llm: LlmAdapter;
  tts: TtsAdapter;
  /** Server port. Default 8787. */
  port?: number;
  /** Default voice when client doesn't specify. */
  defaultVoiceId?: string;
  /** Default language. */
  defaultLanguage?: string;
  /** Default system prompt when client doesn't specify. */
  defaultSystemPrompt?: string;
}

interface SessionState {
  id: string;
  orgId: string;
  ws: WebSocket;
  sampleRate: number;
  language: string;
  voiceId: string;
  systemPrompt: string;
  transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sttStream: SttStream | null;
  llmAbort: AbortController | null;
  ttsAbort: AbortController | null;
}

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function cancelInFlight(state: SessionState): void {
  state.llmAbort?.abort();
  state.ttsAbort?.abort();
  state.llmAbort = null;
  state.ttsAbort = null;
}

async function runAssistantTurn(
  state: SessionState,
  userText: string,
  opts: StreamingServerOptions,
): Promise<void> {
  cancelInFlight(state);
  state.transcript.push({ role: 'user', content: userText });

  const llmAbort = new AbortController();
  state.llmAbort = llmAbort;

  // Stream LLM → buffer into sentences → stream each through TTS.
  let sentenceBuf = '';
  let fullReply = '';
  const ttsAbort = new AbortController();
  state.ttsAbort = ttsAbort;

  const speak = async (sentence: string) => {
    try {
      for await (const chunk of opts.tts.stream({
        text: sentence,
        voiceId: state.voiceId,
        sampleRate: state.sampleRate,
        signal: ttsAbort.signal,
      })) {
        if (ttsAbort.signal.aborted) return;
        send(state.ws, {
          type: 'tts_chunk',
          pcm: chunk.pcm.toString('base64'),
          sampleRate: chunk.sampleRate,
        });
      }
    } catch (err) {
      if (!ttsAbort.signal.aborted) {
        send(state.ws, { type: 'error', code: 'TTS_ERROR', message: String(err) });
      }
    }
  };

  try {
    for await (const { delta, done } of opts.llm.stream({
      orgId: state.orgId,
      sessionId: state.id,
      messages: state.transcript,
      signal: llmAbort.signal,
    })) {
      if (llmAbort.signal.aborted) return;
      if (delta) {
        send(state.ws, { type: 'llm_delta', text: delta });
        sentenceBuf += delta;
        fullReply += delta;

        // Flush on sentence boundary to begin TTS early (lowers perceived latency)
        const boundary = sentenceBuf.search(/[.!?…]\s|[\n\r]/);
        if (boundary >= 0) {
          const ready = sentenceBuf.slice(0, boundary + 1).trim();
          sentenceBuf = sentenceBuf.slice(boundary + 1);
          if (ready) void speak(ready);
        }
      }
      if (done) break;
    }
    if (sentenceBuf.trim()) await speak(sentenceBuf.trim());
  } catch (err) {
    if (!llmAbort.signal.aborted) {
      send(state.ws, { type: 'error', code: 'LLM_ERROR', message: String(err) });
    }
    return;
  }

  if (fullReply.trim()) state.transcript.push({ role: 'assistant', content: fullReply });
  send(state.ws, { type: 'utterance_end' });
}

async function pumpStt(state: SessionState, opts: StreamingServerOptions): Promise<void> {
  if (!state.sttStream) return;
  try {
    for await (const evt of state.sttStream.events) {
      if (evt.type === 'partial') {
        send(state.ws, { type: 'stt_partial', text: evt.text, endOfSpeech: !!evt.endOfSpeech });
      } else if (evt.type === 'final') {
        send(state.ws, { type: 'stt_final', text: evt.text });
        if (evt.text.trim()) void runAssistantTurn(state, evt.text, opts);
      }
    }
  } catch (err) {
    send(state.ws, { type: 'error', code: 'STT_ERROR', message: String(err) });
  }
}

export function createStreamingServer(opts: StreamingServerOptions): {
  wss: WebSocketServer;
  close: () => Promise<void>;
} {
  const port = opts.port ?? 8787;
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const state: SessionState = {
      id: randomUUID(),
      orgId: '',
      ws,
      sampleRate: 16000,
      language: opts.defaultLanguage ?? 'en',
      voiceId: opts.defaultVoiceId ?? 'default',
      systemPrompt:
        opts.defaultSystemPrompt ?? 'You are a helpful voice assistant. Reply concisely.',
      transcript: [],
      sttStream: null,
      llmAbort: null,
      ttsAbort: null,
    };

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      } catch {
        send(ws, { type: 'error', code: 'BAD_JSON', message: 'expected JSON frame' });
        return;
      }

      const type = msg.type;
      if (type === 'start') {
        state.orgId = String(msg.orgId ?? '');
        state.sampleRate = Number(msg.sampleRate ?? 16000);
        state.language = String(msg.language ?? state.language);
        state.voiceId = String(msg.voiceId ?? state.voiceId);
        state.systemPrompt = String(msg.systemPrompt ?? state.systemPrompt);
        state.transcript = [{ role: 'system', content: state.systemPrompt }];
        state.sttStream = opts.stt.open({ sampleRate: state.sampleRate, language: state.language });
        void pumpStt(state, opts);
        send(ws, { type: 'ready', sessionId: state.id, latencyHint: 180 });
        return;
      }

      if (type === 'audio') {
        if (!state.sttStream) {
          send(ws, { type: 'error', code: 'NOT_STARTED', message: 'send "start" first' });
          return;
        }
        const b64 = typeof msg.pcm === 'string' ? msg.pcm : '';
        if (b64) state.sttStream.pushAudio(Buffer.from(b64, 'base64'));
        return;
      }

      if (type === 'text') {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (content.trim()) void runAssistantTurn(state, content, opts);
        return;
      }

      if (type === 'barge_in') {
        cancelInFlight(state);
        send(ws, { type: 'utterance_end' });
        return;
      }

      if (type === 'end') {
        state.sttStream?.finalize();
        return;
      }

      send(ws, {
        type: 'error',
        code: 'UNKNOWN_TYPE',
        message: `unknown frame type: ${String(type)}`,
      });
    });

    ws.on('close', () => {
      cancelInFlight(state);
      state.sttStream?.close();
    });
  });

  return {
    wss,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}

/**
 * Stub adapters — used in dev / tests when real providers aren't configured.
 * They echo back inputs and produce deterministic dummy PCM so the wire
 * protocol can be exercised without external services.
 */
export function createStubAdapters(): { stt: SttAdapter; llm: LlmAdapter; tts: TtsAdapter } {
  const stt: SttAdapter = {
    open({ sampleRate, language }) {
      void sampleRate;
      void language;
      const queue: Array<{ type: 'partial' | 'final'; text: string; endOfSpeech?: boolean }> = [];
      let resolve: ((v: IteratorResult<(typeof queue)[number]>) => void) | null = null;
      let closed = false;
      const events: AsyncIterable<(typeof queue)[number]> = {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
              if (closed) return Promise.resolve({ value: undefined as never, done: true });
              return new Promise<IteratorResult<(typeof queue)[number]>>((r) => {
                resolve = r;
              });
            },
          };
        },
      };
      return {
        pushAudio() {
          /* stub ignores PCM */
        },
        finalize() {
          closed = true;
          if (resolve) {
            resolve({ value: undefined as never, done: true });
            resolve = null;
          }
        },
        events,
        close() {
          closed = true;
        },
      };
    },
  };

  const llm: LlmAdapter = {
    async *stream({ messages }) {
      const last = messages[messages.length - 1]?.content ?? '';
      const reply = `You said: ${last}`;
      for (const word of reply.split(' ')) {
        yield { delta: word + ' ' };
      }
      yield { delta: '', done: true };
    },
  };

  const tts: TtsAdapter = {
    async *stream({ text, sampleRate }) {
      const sr = sampleRate ?? 24000;
      const pcm = Buffer.alloc(Math.max(2, text.length) * 2); // silence, 16-bit
      yield { pcm, sampleRate: sr };
    },
  };

  return { stt, llm, tts };
}
