/**
 * Embedding provider abstraction (#335).
 *
 * Supports Voyage AI (default, Anthropic-recommended) and OpenAI embeddings.
 * The target dimensionality is fixed at 1024 to match the `vector(1024)`
 * column on `kb_chunks`. OpenAI's `text-embedding-3-small` supports
 * dimension truncation, so it is requested with `dimensions: 1024`.
 *
 * Without a configured key the helpers fall back to a deterministic zero-ish
 * vector so dev/test environments can exercise ingestion/search plumbing
 * without burning API credits. Search results in that mode are meaningless
 * but the query path itself is exercised.
 */

import { EMBEDDING_DIMS } from '../../db/schema/kb-embeddings.js';
import { AppError } from '../../lib/app-error.js';

type EmbeddingProvider = 'voyage' | 'openai' | 'mock';

function provider(): EmbeddingProvider {
  const p = (process.env.EMBEDDING_PROVIDER ?? 'voyage').toLowerCase();
  if (p === 'voyage') return process.env.VOYAGE_API_KEY ? 'voyage' : 'mock';
  if (p === 'openai') return process.env.OPENAI_API_KEY ? 'openai' : 'mock';
  return 'mock';
}

// ─── Voyage AI ────────────────────────────────────────────────────────────────

async function embedVoyage(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: process.env.VOYAGE_MODEL ?? 'voyage-3',
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw AppError.internal(`Voyage embedding failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function embedOpenAi(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      dimensions: EMBEDDING_DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw AppError.internal(`OpenAI embedding failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

// ─── Mock — deterministic hash-based pseudo-embedding for test/dev ────────────

function mockEmbed(text: string): number[] {
  const out = new Array<number>(EMBEDDING_DIMS).fill(0);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    const pos = (h >>> 0) % EMBEDDING_DIMS;
    out[pos] = (out[pos] ?? 0) + 1;
  }
  // L2 normalise
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return out.map((v) => v / norm);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  switch (provider()) {
    case 'voyage':
      return embedVoyage(texts);
    case 'openai':
      return embedOpenAi(texts);
    default:
      return texts.map(mockEmbed);
  }
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw AppError.internal('Embedding returned empty');
  return vec;
}

export function activeProvider(): EmbeddingProvider {
  return provider();
}
