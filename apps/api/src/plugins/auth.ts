import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifySession, type SessionData } from '../services/auth/sessions.js';
import { AppError } from '../lib/app-error.js';
import type { UserRole } from '@forgemsg/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionData;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
  }
}

function extractToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  const cookieToken = (request.cookies as Record<string, string> | undefined)?.['fm_session'];
  if (cookieToken) return cookieToken;

  return null;
}

async function authPlugin(app: FastifyInstance) {
  // Populate request.user when a valid token is present (does not throw if missing).
  app.addHook('onRequest', async (request) => {
    const token = extractToken(request);
    if (!token) return;
    const session = await verifySession(token);
    if (session) request.user = session;
  });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    if (!request.user) throw AppError.unauthorized('Authentication required');
  });

  const ROLE_RANK: Record<UserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4,
  };

  app.decorate('requireRole', (...roles: UserRole[]) => {
    return async (request: FastifyRequest) => {
      if (!request.user) throw AppError.unauthorized('Authentication required');
      const userRank = ROLE_RANK[request.user.role];
      const requiredRank = Math.min(...roles.map((r) => ROLE_RANK[r]));
      if (userRank < requiredRank) {
        throw AppError.forbidden(`Requires one of: ${roles.join(', ')}`);
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth', dependencies: ['cookie'] });
