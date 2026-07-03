import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifySession, type SessionData } from '../services/auth/sessions.js';
import { lookupApiKey } from '../services/webhooks/index.js';
import { scopeAllows, requiredScopeFor } from '../services/auth/scope-map.js';
import { AppError } from '../lib/app-error.js';
import type { UserRole } from '@forgemsg/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionData;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest) => Promise<void>;
    authenticate: (request: FastifyRequest) => Promise<void>;
    /**
     * Auth for SDK ingest endpoints — accepts public (publishable) keys as well
     * as secret keys and JWT sessions. Use ONLY on write-only/limited routes the
     * browser web-sdk needs (in-app message match, event ingest). Never on a
     * route that reads or mutates org data broadly.
     */
    authenticatePublic: (request: FastifyRequest) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
    /**
     * Gate a route by API-key scope. JWT/session users pass (governed by RBAC);
     * API-key requests pass only when the key holds '*' or the required scope.
     */
    requireScope: (scope: string) => (request: FastifyRequest) => Promise<void>;
    /** Gate /superadmin/* routes — only role=system_admin passes. */
    requireSystemAdmin: (request: FastifyRequest) => Promise<void>;
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
  // Secret-route gate: authenticated AND not a public (publishable) key. A
  // public key leaked in browser JS must not be able to reach any secret route.
  const requireSecretAuth = async (request: FastifyRequest) => {
    if (!request.user) throw AppError.unauthorized('Authentication required');
    if (request.user.isPublicKey) {
      throw AppError.forbidden('Public API keys cannot access this endpoint');
    }
  };

  // Also expose an authenticate decorator (alias for requireAuth) for consistent naming.
  app.decorate('authenticate', requireSecretAuth);

  // SDK ingest gate — accepts public keys too (see interface doc above).
  app.decorate('authenticatePublic', async (request: FastifyRequest) => {
    if (!request.user) throw AppError.unauthorized('Authentication required');
  });

  // Populate request.user from JWT session OR X-API-Key header.
  app.addHook('onRequest', async (request) => {
    // 1) Try API key header first
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const key = await lookupApiKey(apiKeyHeader).catch(() => null);
      if (key) {
        // Build a minimal SessionData from the API key. `mode` carries
        // the sandbox flag through so routes like /emails can short-circuit
        // MTA dispatch when the caller used a test key.
        request.user = {
          userId: key.userId ?? key.id,
          orgId: key.orgId,
          role: 'admin' as UserRole,
          email: '',
          apiKeyMode: ((key as { mode?: 'live' | 'test' }).mode ?? 'live') as 'live' | 'test',
          apiKeyScopes: (key as { scopes?: string[] }).scopes ?? [],
          isPublicKey: (key as { isPublic?: boolean }).isPublic ?? false,
        };
        return;
      }
    }

    // 2) Fall back to Bearer / cookie JWT session
    const token = extractToken(request);
    if (!token) return;
    const session = await verifySession(token);
    if (session) request.user = session;
  });

  // Global least-privilege guard for API keys. Runs after the onRequest hook
  // above populates request.user. Enforces scopes ACROSS the whole surface for
  // keys that carry an explicit, non-wildcard scope list — legacy/unscoped keys
  // and JWT sessions are unaffected (scopeAllows returns true for them), and
  // unmapped routes are never gated. This is the single choke point that makes
  // per-key least privilege real without annotating every route.
  app.addHook('preHandler', async (request) => {
    const scopes = request.user?.apiKeyScopes;
    if (scopeAllows(scopes, request.method, request.url)) return;
    throw AppError.forbidden(
      `API key missing required scope: ${requiredScopeFor(request.method, request.url)}`,
    );
  });

  app.decorate('requireAuth', requireSecretAuth);

  const ROLE_RANK: Record<UserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4,
    // system_admin is platform-level, not in the org hierarchy. Treated
    // as max rank for requireRole so it implicitly bypasses per-org checks
    // — useful when system_admin needs to call regular endpoints during
    // support intervention.
    system_admin: 99,
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

  app.decorate('requireScope', (scope: string) => {
    return async (request: FastifyRequest) => {
      if (!request.user) throw AppError.unauthorized('Authentication required');
      // JWT / session users are governed by RBAC roles, not key scopes.
      const scopes = request.user.apiKeyScopes;
      if (scopes === undefined) return;
      // Empty scope list = legacy/unscoped key → treated as full access for
      // backward compatibility. Only keys with an explicit, non-wildcard scope
      // list are restricted (least-privilege enforcement).
      if (scopes.length === 0 || scopes.includes('*') || scopes.includes(scope)) return;
      throw AppError.forbidden(`API key missing required scope: ${scope}`);
    };
  });

  app.decorate('requireSystemAdmin', async (request: FastifyRequest) => {
    if (!request.user) throw AppError.unauthorized('Authentication required');
    if (request.user.role !== 'system_admin') {
      throw AppError.forbidden('System admin only');
    }
  });
}

export default fp(authPlugin, { name: 'auth', dependencies: ['cookie'] });
