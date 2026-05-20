/**
 * Knowledge-base embeddings — RAG vector store (#335).
 *
 * Two-level model:
 *   kb_documents — logical source (URL, KB article, uploaded PDF, ticket
 *                  resolution, blog post). Carries metadata + ingestion state.
 *   kb_chunks    — text chunks + embedding vectors. Each chunk references a
 *                  document and stores the Voyage/OpenAI embedding.
 *
 * Embedding dimensionality = 1024 (voyage-3 default; OpenAI
 * text-embedding-3-small can be truncated to 1024 at request time). One
 * per-org vector index supports cosine similarity search.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const EMBEDDING_DIMS = 1024;

/** Source types the ingester understands. */
export type KbSourceType =
  | 'kb_article'
  | 'helpdesk_ticket'
  | 'blog_post'
  | 'url'
  | 'upload'
  | 'template'
  | 'custom';

export const kbDocuments = pgTable(
  'kb_documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** kb_article | helpdesk_ticket | blog_post | url | upload | template | custom */
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    /** Optional foreign key to the originating row (e.g. ticket id, blog post id). */
    sourceId: varchar('source_id', { length: 255 }),
    /** Stable external identifier for re-ingest (URL, file hash). */
    externalRef: varchar('external_ref', { length: 1024 }),

    title: text('title').notNull(),
    url: text('url'),
    language: varchar('language', { length: 8 }).notNull().default('en'),

    /** Full source text (pre-chunk). Kept for re-chunking without re-fetch. */
    body: text('body').notNull(),
    /** SHA-256 of body for change detection. */
    contentHash: varchar('content_hash', { length: 64 }).notNull(),

    /** pending | embedding | ready | failed */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    error: text('error'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kb_documents_org_idx').on(t.orgId),
    index('kb_documents_source_idx').on(t.orgId, t.sourceType, t.sourceId),
    index('kb_documents_ref_idx').on(t.orgId, t.externalRef),
    index('kb_documents_status_idx').on(t.status),
  ],
);

export const kbChunks = pgTable(
  'kb_chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => kbDocuments.id, { onDelete: 'cascade' }),

    /** 0-based index of the chunk within the document. */
    chunkIndex: integer('chunk_index').notNull(),
    chunkText: text('chunk_text').notNull(),
    /** Approximate token count (4 chars ~ 1 token). */
    tokenCount: integer('token_count').notNull().default(0),

    /** Cosine-similarity embedding, 1024 dims. Null until populated. */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMS }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('kb_chunks_org_idx').on(t.orgId), index('kb_chunks_doc_idx').on(t.documentId)],
);

export type KbDocument = typeof kbDocuments.$inferSelect;
export type NewKbDocument = typeof kbDocuments.$inferInsert;
export type KbChunk = typeof kbChunks.$inferSelect;
export type NewKbChunk = typeof kbChunks.$inferInsert;
