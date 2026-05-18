/**
 * RAG ingestion + retrieval service (#335).
 *
 * Flow:
 *   1. `ingestDocument` splits source text into ~800-token chunks with 80-token
 *      overlap, embeds each chunk, and upserts into `kb_documents` +
 *      `kb_chunks`.
 *   2. `search` embeds the query and returns top-K chunks by cosine similarity,
 *      scoped to the caller's org.
 *   3. Customer / Content agents call `buildContext` to turn the top chunks
 *      into a prompt-ready context block with citations.
 */

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  kbDocuments, kbChunks,
  type KbDocument, type KbSourceType,
  EMBEDDING_DIMS,
} from '../../db/schema/kb-embeddings.js';
import { AppError } from '../../lib/app-error.js';
import { embedTexts, embedQuery } from './embedding.js';

// ─── Chunking ─────────────────────────────────────────────────────────────────

const CHUNK_TARGET_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 80;
const CHARS_PER_TOKEN = 4;

export function chunkText(
  text: string,
  targetTokens = CHUNK_TARGET_TOKENS,
  overlapTokens = CHUNK_OVERLAP_TOKENS,
): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const target = targetTokens * CHARS_PER_TOKEN;
  const overlap = overlapTokens * CHARS_PER_TOKEN;

  // Prefer splitting on paragraph boundaries, then sentences.
  const paragraphs = cleaned.split(/(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9])/u);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf.length + p.length + 1 > target) {
      if (buf) chunks.push(buf.trim());
      // carry overlap from the tail of the previous chunk
      buf = buf.slice(Math.max(0, buf.length - overlap));
      buf += ' ' + p;
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

export interface IngestInput {
  sourceType: KbSourceType;
  sourceId?: string;
  externalRef?: string;
  title: string;
  body: string;
  url?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export async function ingestDocument(orgId: string, input: IngestInput): Promise<KbDocument> {
  if (!input.body?.trim()) throw AppError.badRequest('body is required');

  const hash = contentHash(input.body);

  // Upsert by (orgId, sourceType, sourceId) when provided, else by externalRef.
  let existing: KbDocument | undefined;
  if (input.sourceId) {
    const rows = await db.select().from(kbDocuments).where(and(
      eq(kbDocuments.orgId, orgId),
      eq(kbDocuments.sourceType, input.sourceType),
      eq(kbDocuments.sourceId, input.sourceId),
    )).limit(1);
    existing = rows[0];
  } else if (input.externalRef) {
    const rows = await db.select().from(kbDocuments).where(and(
      eq(kbDocuments.orgId, orgId),
      eq(kbDocuments.externalRef, input.externalRef),
    )).limit(1);
    existing = rows[0];
  }

  // If nothing changed we skip re-embedding entirely.
  if (existing && existing.contentHash === hash && existing.status === 'ready') {
    return existing;
  }

  const now = new Date();
  let docId: string;
  if (existing) {
    await db.update(kbDocuments).set({
      title: input.title,
      url: input.url ?? existing.url,
      language: input.language ?? existing.language,
      body: input.body,
      contentHash: hash,
      status: 'embedding',
      metadata: input.metadata ?? existing.metadata,
      updatedAt: now,
      error: null,
    }).where(eq(kbDocuments.id, existing.id));
    await db.delete(kbChunks).where(eq(kbChunks.documentId, existing.id));
    docId = existing.id;
  } else {
    const inserted = await db.insert(kbDocuments).values({
      orgId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      externalRef: input.externalRef ?? null,
      title: input.title,
      url: input.url ?? null,
      language: input.language ?? 'en',
      body: input.body,
      contentHash: hash,
      status: 'embedding',
      metadata: input.metadata ?? {},
    }).returning();
    const row = inserted[0];
    if (!row) throw AppError.internal('Failed to create kb document');
    docId = row.id;
  }

  const chunks = chunkText(input.body);
  if (chunks.length === 0) {
    await db.update(kbDocuments).set({ status: 'ready', updatedAt: new Date() })
      .where(eq(kbDocuments.id, docId));
  } else {
    try {
      // Batch into groups of 32 for embedding request limits.
      const BATCH = 32;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const vectors = await embedTexts(batch);
        for (let j = 0; j < batch.length; j++) {
          const chunkText = batch[j]!;
          const vec = vectors[j];
          if (!vec || vec.length !== EMBEDDING_DIMS) {
            throw AppError.internal(`Embedding dim mismatch: got ${vec?.length}`);
          }
          await db.insert(kbChunks).values({
            orgId,
            documentId: docId,
            chunkIndex: i + j,
            chunkText,
            tokenCount: Math.ceil(chunkText.length / CHARS_PER_TOKEN),
            embedding: vec,
          });
        }
      }
      await db.update(kbDocuments).set({ status: 'ready', updatedAt: new Date() })
        .where(eq(kbDocuments.id, docId));
    } catch (err) {
      await db.update(kbDocuments).set({
        status: 'failed',
        error: (err as Error).message,
        updatedAt: new Date(),
      }).where(eq(kbDocuments.id, docId));
      throw err;
    }
  }

  const out = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1);
  if (!out[0]) throw AppError.internal('kb document vanished post-ingest');
  return out[0];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchHit {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  url: string | null;
  snippet: string;
  similarity: number;
  sourceType: string;
}

export async function search(
  orgId: string,
  query: string,
  opts?: { topK?: number; sourceTypes?: KbSourceType[]; minSimilarity?: number },
): Promise<SearchHit[]> {
  if (!query?.trim()) return [];
  const topK = opts?.topK ?? 5;
  const minSim = opts?.minSimilarity ?? 0;

  const vec = await embedQuery(query);
  const literal = sql.raw(`'[${vec.join(',')}]'::vector`);

  const sourceFilter = opts?.sourceTypes?.length
    ? sql` AND d.source_type = ANY(ARRAY[${sql.raw(
        opts.sourceTypes.map((s) => `'${s.replace(/'/g, "''")}'`).join(','),
      )}]::text[])`
    : sql``;

  const result = await db.execute<{
    document_id: string;
    chunk_id: string;
    chunk_index: number;
    title: string;
    url: string | null;
    snippet: string;
    source_type: string;
    similarity: number;
  }>(sql`
    SELECT
      c.document_id,
      c.id                     AS chunk_id,
      c.chunk_index,
      d.title,
      d.url,
      c.chunk_text             AS snippet,
      d.source_type,
      1 - (c.embedding <=> ${literal}) AS similarity
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id
    WHERE c.org_id = ${orgId}::uuid
      AND c.embedding IS NOT NULL
      AND d.status = 'ready'
      ${sourceFilter}
    ORDER BY c.embedding <=> ${literal}
    LIMIT ${topK}
  `);
  const rows = result as unknown as Array<{
    document_id: string; chunk_id: string; chunk_index: number;
    title: string; url: string | null; snippet: string;
    source_type: string; similarity: number;
  }>;

  return rows
    .filter((r) => Number(r.similarity) >= minSim)
    .map((r) => ({
      documentId: r.document_id,
      chunkId: r.chunk_id,
      chunkIndex: Number(r.chunk_index),
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      similarity: Number(r.similarity),
      sourceType: r.source_type,
    }));
}

/**
 * Build a compact prompt-ready context block from search hits. Used by
 * Customer / Content agents to ground their answers.
 */
export function buildContext(hits: SearchHit[], maxChars = 6000): string {
  const parts: string[] = [];
  let used = 0;
  for (const [i, h] of hits.entries()) {
    const cite = `[${i + 1}] ${h.title}${h.url ? ` (${h.url})` : ''}`;
    const body = h.snippet.trim();
    const block = `${cite}\n${body}`;
    if (used + block.length + 2 > maxChars) break;
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join('\n\n');
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export async function deleteDocument(orgId: string, documentId: string): Promise<void> {
  await db.delete(kbDocuments)
    .where(and(eq(kbDocuments.orgId, orgId), eq(kbDocuments.id, documentId)));
}

export async function getDocument(orgId: string, documentId: string): Promise<KbDocument> {
  const rows = await db.select().from(kbDocuments)
    .where(and(eq(kbDocuments.orgId, orgId), eq(kbDocuments.id, documentId))).limit(1);
  if (!rows[0]) throw AppError.notFound('Document not found');
  return rows[0];
}

export async function listDocuments(orgId: string, limit = 100): Promise<KbDocument[]> {
  return db.select().from(kbDocuments)
    .where(eq(kbDocuments.orgId, orgId))
    .limit(limit);
}
