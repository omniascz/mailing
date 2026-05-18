import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSocialPost, listSocialPosts, getSocialPost,
  updateSocialPost, deleteSocialPost, publishSocialPost,
} from '../../../services/social/publisher.js';

const socialPostRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/social/posts', auth, async (req, reply) => {
    const q = z.object({
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const data = await listSocialPosts(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.post('/api/v1/social/posts', auth, async (req, reply) => {
    const body = z.object({
      caption: z.string().max(2200).optional(),
      mediaUrls: z.array(z.string().url()).max(10).optional(),
      linkUrl: z.string().url().optional(),
      hashtags: z.array(z.string()).max(30).optional(),
      accountIds: z.array(z.string().uuid()).min(1).max(20),
      scheduledAt: z.string().datetime().optional(),
    }).parse(req.body);
    const data = await createSocialPost(req.user!.orgId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    });
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/social/posts/:postId', auth, async (req, reply) => {
    const { postId } = z.object({ postId: z.string().uuid() }).parse(req.params);
    const data = await getSocialPost(req.user!.orgId, postId);
    return reply.send({ data });
  });

  app.patch('/api/v1/social/posts/:postId', auth, async (req, reply) => {
    const { postId } = z.object({ postId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      caption: z.string().max(2200).optional(),
      mediaUrls: z.array(z.string().url()).optional(),
      hashtags: z.array(z.string()).optional(),
      accountIds: z.array(z.string().uuid()).optional(),
      scheduledAt: z.string().datetime().nullable().optional(),
      status: z.enum(['draft', 'scheduled']).optional(),
    }).parse(req.body);
    const data = await updateSocialPost(req.user!.orgId, postId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    });
    return reply.send({ data });
  });

  app.delete('/api/v1/social/posts/:postId', auth, async (req, reply) => {
    const { postId } = z.object({ postId: z.string().uuid() }).parse(req.params);
    await deleteSocialPost(req.user!.orgId, postId);
    return reply.code(204).send();
  });

  // Publish immediately
  app.post('/api/v1/social/posts/:postId/publish', auth, async (req, reply) => {
    const { postId } = z.object({ postId: z.string().uuid() }).parse(req.params);
    const data = await publishSocialPost(req.user!.orgId, postId);
    return reply.send({ data });
  });
};

export default socialPostRoutes;
