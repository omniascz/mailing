/**
 * Blog routes (#336/#412).
 *
 * Six not-found paths in this file threw a plain object literal:
 *
 *     throw { statusCode: 404, code: 'POST_NOT_FOUND', message: 'Post not found' };
 *
 * `plugins/error-handler.ts` dispatches on `error instanceof AppError` and then
 * on `instanceof ZodError`; an object literal is neither, so it fell through to
 * the 500 branch. Every not-found on these routes was served as
 * `500 INTERNAL_ERROR` — the handler had run correctly, decided the row did not
 * exist, and the answer was still an internal error. Two of them are recorded
 * in integration/route-smoke/known-failures.ts because that sweep visits GETs;
 * the other four are on POST/PUT/DELETE, which it does not call, so they failed
 * the same way unobserved.
 *
 * All six now throw `AppError`. The explicit constructor rather than
 * `AppError.notFound()`, because that helper rewrites the code to `NOT_FOUND`
 * and these carry `POST_NOT_FOUND` / `REVISION_NOT_FOUND`, which a caller may
 * already branch on. Only the status changes: 500 -> 404.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  listPosts,
  getPost,
  getPostBySlug,
  createPost,
  updatePost,
  publishPost,
  schedulePost,
  archivePost,
  deletePost,
  listCategories,
  createCategory,
  listAuthors,
  createAuthor,
} from '../../services/blog/index.js';
import { and, eq, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { blogPostRevisions, blogPosts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { redis } from '@forgemsg/shared/redis';

const blogRoutes: FastifyPluginAsync = async (app) => {
  // Posts
  app.get(
    '/api/v1/blog/posts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'List blog posts' },
    },
    async (req) => {
      const q = z
        .object({
          status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query);
      return { data: await listPosts(req.user!.orgId, q) };
    },
  );

  app.get(
    '/api/v1/blog/posts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'Get a blog post' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getPost(req.user!.orgId, id) };
    },
  );

  app.post(
    '/api/v1/blog/posts',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Create a blog post' },
    },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string().min(1).max(255),
          body: z.string().min(1),
          excerpt: z.string().max(1024).optional(),
          authorId: z.string().uuid().optional(),
          categoryId: z.string().uuid().optional(),
          heroImageUrl: z.string().url().max(2048).optional(),
          tags: z.array(z.string().min(1).max(64)).optional(),
          metaTitle: z.string().max(255).optional(),
          metaDescription: z.string().max(512).optional(),
          canonicalUrl: z.string().url().max(2048).optional(),
          locale: z.string().min(2).max(16).optional(),
          translationGroupId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const post = await createPost(req.user!.orgId, body);
      return reply.code(201).send({ data: post });
    },
  );

  app.patch(
    '/api/v1/blog/posts/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Update a blog post' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          title: z.string().min(1).max(255).optional(),
          body: z.string().min(1).optional(),
          excerpt: z.string().max(1024).optional(),
          heroImageUrl: z.string().url().max(2048).optional(),
          tags: z.array(z.string()).optional(),
          metaTitle: z.string().max(255).optional(),
          metaDescription: z.string().max(512).optional(),
          canonicalUrl: z.string().url().max(2048).optional(),
          status: z.enum(['draft', 'scheduled', 'archived']).optional(),
        })
        .parse(req.body);
      return { data: await updatePost(req.user!.orgId, id, body) };
    },
  );

  app.post(
    '/api/v1/blog/posts/:id/publish',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Publish a blog post' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await publishPost(req.user!.orgId, id, req.user!.userId) };
    },
  );

  app.post(
    '/api/v1/blog/posts/:id/schedule',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Schedule a blog post for future publish' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { publishAt } = z.object({ publishAt: z.string().datetime() }).parse(req.body);
      return { data: await schedulePost(req.user!.orgId, id, new Date(publishAt)) };
    },
  );

  app.post(
    '/api/v1/blog/posts/:id/archive',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Archive a blog post' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await archivePost(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/v1/blog/posts/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Delete a blog post' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deletePost(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // Categories
  app.get(
    '/api/v1/blog/categories',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'List categories' },
    },
    async (req) => ({ data: await listCategories(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/blog/categories',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Create a category' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().max(2048).optional(),
          parentId: z.string().uuid().optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createCategory(req.user!.orgId, body) });
    },
  );

  // Authors
  app.get(
    '/api/v1/blog/authors',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'List authors' },
    },
    async (req) => ({ data: await listAuthors(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/blog/authors',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Create an author profile' },
    },
    async (req, reply) => {
      const body = z
        .object({
          displayName: z.string().min(1).max(255),
          userId: z.string().uuid().optional(),
          bio: z.string().max(4096).optional(),
          avatarUrl: z.string().url().max(2048).optional(),
          socialLinks: z.record(z.string().url().max(2048)).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createAuthor(req.user!.orgId, body) });
    },
  );

  // ─── Content staging / versioning (#339) ─────────────────────────────────

  /**
   * GET /api/v1/blog/posts/:id/revisions
   * Lists all saved revisions for a post, newest first.
   */
  app.get(
    '/api/v1/blog/posts/:id/revisions',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'List post revisions' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const orgId = req.user!.orgId;

      // Verify post belongs to org
      const [post] = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(eq(blogPosts.id, id), eq(blogPosts.orgId, orgId)))
        .limit(1);
      if (!post)
        throw new AppError({ code: 'POST_NOT_FOUND', message: 'Post not found', statusCode: 404 });

      const revisions = await db
        .select()
        .from(blogPostRevisions)
        .where(eq(blogPostRevisions.postId, id))
        .orderBy(asc(blogPostRevisions.createdAt));

      return { data: revisions };
    },
  );

  /**
   * POST /api/v1/blog/posts/:id/revisions/:version/restore
   * Restores a post to a specific revision (overwrites current draft body).
   */
  app.post(
    '/api/v1/blog/posts/:id/revisions/:version/restore',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Restore post to a prior revision' },
    },
    async (req) => {
      const { id, version } = z
        .object({ id: z.string().uuid(), version: z.string().min(1).max(16) })
        .parse(req.params);
      const orgId = req.user!.orgId;

      const [rev] = await db
        .select()
        .from(blogPostRevisions)
        .where(and(eq(blogPostRevisions.postId, id), eq(blogPostRevisions.version, version)))
        .limit(1);
      if (!rev)
        throw new AppError({
          code: 'REVISION_NOT_FOUND',
          message: 'Revision not found',
          statusCode: 404,
        });

      const [updated] = await db
        .update(blogPosts)
        .set({
          title: rev.title,
          body: rev.body,
          excerpt: rev.excerpt ?? undefined,
          status: 'draft', // restoring sets back to draft for review
          updatedAt: new Date(),
        })
        .where(and(eq(blogPosts.id, id), eq(blogPosts.orgId, orgId)))
        .returning();
      if (!updated)
        throw new AppError({ code: 'POST_NOT_FOUND', message: 'Post not found', statusCode: 404 });
      return { data: updated };
    },
  );

  /**
   * GET /api/v1/blog/posts/:id/revisions/:vA/diff/:vB
   * Returns a character-level diff summary between two revision bodies.
   */
  app.get(
    '/api/v1/blog/posts/:id/revisions/:vA/diff/:vB',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Blog'], summary: 'Diff two post revisions' },
    },
    async (req) => {
      const { id, vA, vB } = z
        .object({ id: z.string().uuid(), vA: z.string().min(1), vB: z.string().min(1) })
        .parse(req.params);
      const orgId = req.user!.orgId;

      const [post] = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(eq(blogPosts.id, id), eq(blogPosts.orgId, orgId)))
        .limit(1);
      if (!post)
        throw new AppError({ code: 'POST_NOT_FOUND', message: 'Post not found', statusCode: 404 });

      const revs = await db
        .select()
        .from(blogPostRevisions)
        .where(eq(blogPostRevisions.postId, id));

      const revA = revs.find((r) => r.version === vA);
      const revB = revs.find((r) => r.version === vB);
      if (!revA || !revB)
        throw new AppError({
          code: 'REVISION_NOT_FOUND',
          message: 'One or both revisions not found',
          statusCode: 404,
        });

      // Simple line-count diff (no external diff library required)
      const linesA = revA.body.split('\n');
      const linesB = revB.body.split('\n');
      const added = linesB.filter((l) => !linesA.includes(l)).length;
      const removed = linesA.filter((l) => !linesB.includes(l)).length;

      return {
        data: {
          vA,
          vB,
          titleChanged: revA.title !== revB.title,
          bodyChangedLines: { added, removed },
          charDiff: revB.body.length - revA.body.length,
        },
      };
    },
  );

  /**
   * POST /api/v1/blog/posts/:id/preview-token
   * Generates a time-limited (15min) preview token for sharing a draft.
   * Returns: { previewToken, previewUrl }
   */
  app.post(
    '/api/v1/blog/posts/:id/preview-token',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Blog'], summary: 'Generate a time-limited preview URL for a draft post' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const orgId = req.user!.orgId;

      const [post] = await db
        .select({ slug: blogPosts.slug })
        .from(blogPosts)
        .where(and(eq(blogPosts.id, id), eq(blogPosts.orgId, orgId)))
        .limit(1);
      if (!post)
        throw new AppError({ code: 'POST_NOT_FOUND', message: 'Post not found', statusCode: 404 });

      const token = randomUUID();
      await redis.set(`blog:preview:${token}`, JSON.stringify({ postId: id, orgId }), 'EX', 900);

      return {
        data: {
          previewToken: token,
          expiresInSeconds: 900,
          // Frontend would use: /blog/preview?token=<token>
          previewUrl: `/api/v1/blog/preview?token=${token}`,
        },
      };
    },
  );

  /**
   * GET /api/v1/blog/preview?token=
   * Public endpoint to view a draft post via preview token (15min TTL).
   */
  app.get(
    '/api/v1/blog/preview',
    { schema: { tags: ['Blog'], summary: 'View a draft post via preview token' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().uuid() }).parse(req.query);
      const raw = await redis.get(`blog:preview:${token}`);
      if (!raw)
        return reply
          .code(401)
          .send({ code: 'INVALID_TOKEN', message: 'Preview token expired or invalid' });

      const { postId } = JSON.parse(raw) as { postId: string; orgId: string };
      const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
      if (!post) return reply.code(404).send({ code: 'POST_NOT_FOUND' });
      return { data: post };
    },
  );

  // Public read (blog frontend consumption)
  app.get(
    '/api/v1/blog/public/:slug',
    {
      schema: { tags: ['Blog'], summary: 'Public read of a published post by slug' },
    },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(255) }).parse(req.params);
      const q = z
        .object({
          orgSlug: z.string().min(1).max(128),
          locale: z.string().min(2).max(16).optional(),
        })
        .parse(req.query);

      // Look up org by slug
      const { eq } = await import('drizzle-orm');
      const { organizations } = await import('../../db/schema/organizations.js');
      const { db } = await import('../../db/client.js');
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, q.orgSlug))
        .limit(1);
      if (!org) return reply.code(404).send({ code: 'ORG_NOT_FOUND' });

      const post = await getPostBySlug(org.id, slug, q.locale ?? 'en');
      if (!post || post.status !== 'published') {
        return reply.code(404).send({ code: 'POST_NOT_FOUND' });
      }
      return { data: post };
    },
  );
};

export default blogRoutes;
