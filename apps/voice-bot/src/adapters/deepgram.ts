/**
 * Deepgram streaming STT adapter (real).
 * Opens a WebSocket to Deepgram's live transcription API, pushes linear16 PCM,
 * and emits interim (partial) + final transcripts.
 * Docs: https://developers.deepgram.com/reference/listen-live
 */
import { WebSocket } from 'ws';
import type { SttAdapter, SttStream } from '../api/streaming.js';

type SttEvent = { type: 'partial' | 'final'; text: string; endOfSpeech?: boolean };

/** Minimal push/pull async queue for streaming events. */
function makeEventQueue<T>() {
  const buffer: T[] = [];
  let resolveNext: ((r: IteratorResult<T>) => void) | null = null;
  let done = false;

  return {
    push(v: T) {
      if (done) return;
      if (resolveNext) {
        resolveNext({ value: v, done: false });
        resolveNext = null;
      } else {
        buffer.push(v);
      }
    },
    end() {
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as never, done: true });
        resolveNext = null;
      }
    },
    iterable: {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next() {
            if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
            if (done) return Promise.resolve({ value: undefined as never, done: true });
            return new Promise<IteratorResult<T>>((r) => {
              resolveNext = r;
            });
          },
        };
      },
    } as AsyncIterable<T>,
  };
}

export interface DeepgramOpts {
  model?: string;
  /** Wire encoding of the PCM pushed in. 'mulaw' for Twilio Media Streams. */
  encoding?: 'linear16' | 'mulaw';
}

export function createDeepgramStt(apiKey: string, opts: DeepgramOpts | string = {}): SttAdapter {
  // Back-compat: a bare string is treated as the model name.
  const o: DeepgramOpts = typeof opts === 'string' ? { model: opts } : opts;
  const model = o.model ?? 'nova-2';
  const encoding = o.encoding ?? 'linear16';
  return {
    open({ sampleRate, language }): SttStream {
      const q = makeEventQueue<SttEvent>();
      const params = new URLSearchParams({
        encoding,
        sample_rate: String(sampleRate),
        language,
        model,
        interim_results: 'true',
        punctuate: 'true',
        endpointing: '300',
      });
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
        headers: { Authorization: `Token ${apiKey}` },
      });

      const pending: Buffer[] = [];
      let opened = false;
      ws.on('open', () => {
        opened = true;
        for (const buf of pending) ws.send(buf);
        pending.length = 0;
      });
      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString('utf8')) as {
            channel?: { alternatives?: Array<{ transcript?: string }> };
            is_final?: boolean;
            speech_final?: boolean;
          };
          const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
          if (!text) return;
          if (msg.is_final) {
            q.push({ type: 'final', text });
          } else {
            q.push({ type: 'partial', text, endOfSpeech: !!msg.speech_final });
          }
        } catch {
          /* ignore non-JSON keepalives */
        }
      });
      ws.on('error', () => q.end());
      ws.on('close', () => q.end());

      return {
        pushAudio(pcm: Buffer) {
          if (opened && ws.readyState === ws.OPEN) ws.send(pcm);
          else pending.push(pcm);
        },
        finalize() {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
        },
        events: q.iterable,
        close() {
          q.end();
          try {
            ws.close();
          } catch {
            /* noop */
          }
        },
      };
    },
  };
}
