/**
 * Public SEO routes (#291/#411).
 *
 *   GET /seo/sitemap.xml?org=<slug> — org's sitemap (crawled by search engines)
 *   GET /seo/robots.txt?org=<slug>  — robots.txt pointing at the sitemap
 *
 * These routes are intentionally unauthenticated. Tenants expose them
 * through their own custom domain via a reverse-proxy / CDN rewrite.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/organizations.js';
import { AppError } from '../../../lib/app-error.js';
import { generateSitemap, generateRobotsTxt } from '../../../services/seo/sitemap.js';

const seoSitemapRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/seo/sitemap.xml',
    {
      schema: { tags: ['SEO'], summary: 'Org sitemap.xml' },
    },
    async (req, reply) => {
      const query = z
        .object({
          org: z.string().min(1).max(128),
          origin: z.string().url().optional(),
        })
        .parse(req.query);

      const [org] = await db
        .select({ id: organizations.id, settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.slug, query.org))
        .limit(1);
      if (!org) throw AppError.notFound('Organization');

      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const origin =
        query.origin ??
        (typeof settings.publicOrigin === 'string' ? settings.publicOrigin : null) ??
        `https://${query.org}.forgemsg.io`;

      const xml = await generateSitemap({ orgId: org.id, origin });
      return reply
        .header('Content-Type', 'application/xml; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600')
        .send(xml);
    },
  );

  app.get(
    '/seo/robots.txt',
    {
      schema: { tags: ['SEO'], summary: 'Org robots.txt' },
    },
    async (req, reply) => {
      const query = z
        .object({
          org: z.string().min(1).max(128),
          origin: z.string().url().optional(),
        })
        .parse(req.query);

      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.slug, query.org))
        .limit(1);
      if (!org) throw AppError.notFound('Organization');

      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const origin =
        query.origin ??
        (typeof settings.publicOrigin === 'string' ? settings.publicOrigin : null) ??
        `https://${query.org}.forgemsg.io`;

      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600')
        .send(generateRobotsTxt(origin));
    },
  );
};

export default seoSitemapRoutes;
