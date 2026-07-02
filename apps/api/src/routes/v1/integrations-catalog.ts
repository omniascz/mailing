/**
 * Integrations marketplace catalog route (#6 CC-gap).
 * A browsable directory of everything ForgeMsg connects to.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listIntegrationCatalog,
  integrationCategories,
  type IntegrationCategory,
} from '../../services/integrations/catalog.js';

const CATEGORIES = [
  'ecommerce',
  'crm',
  'social',
  'ads',
  'productivity',
  'payments',
  'shipping',
  'automation',
  'developer',
] as const;

const integrationsCatalogRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/integrations/catalog',
    { schema: { tags: ['Integrations'], summary: 'Browse the integrations marketplace' } },
    async (req) => {
      const q = z.object({ category: z.enum(CATEGORIES).optional() }).parse(req.query);
      return {
        data: {
          categories: integrationCategories(),
          integrations: listIntegrationCatalog(q.category as IntegrationCategory | undefined),
        },
      };
    },
  );
};

export default integrationsCatalogRoutes;
