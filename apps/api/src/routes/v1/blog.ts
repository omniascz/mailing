/**
 * Blog routes (#336/#412).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
