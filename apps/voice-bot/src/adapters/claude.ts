/**
 * Claude streaming LLM adapter (real).
 * Streams assistant tokens from the Anthropic Messages API (SSE).
 * Docs: https://docs.anthropic.com/en/api/messages-streaming
 */
import type { LlmAdapter } from '../api/streaming.js';

export function createClaudeLlm(
  apiKey: string,
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 300,
): LlmAdapter {
  return {
    async *stream({ messages, signal }) {
      // Anthropic wants the system prompt separate from the message list.
      const system = messages.find((m) => m.role === 'system')?.content;
      const convo = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          stream: true,
          ...(system ? { system } : {}),
          messages: convo,
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const detail = res.ok ? 'no body' : `${res.status} ${await res.text().catch(() => '')}`;
        throw new Error(`Claude stream failed: ${detail}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) break;
          buf += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line.
          let nl: number;
          while ((nl = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, nl);
            buf = buf.slice(nl + 2);
            const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            try {
              const evt = JSON.parse(json) as {
                type?: string;
                delta?: { text?: string };
              };
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                yield { delta: evt.delta.text };
              } else if (evt.type === 'message_stop') {
                yield { delta: '', done: true };
                return;
              }
            } catch {
              /* ignore partial / non-JSON */
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      yield { delta: '', done: true };
    },
  };
}
