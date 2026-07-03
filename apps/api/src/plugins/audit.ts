/**
 * Audit-log plugin — records org-facing state changes automatically.
 *
 * SendGrid/HubSpot-style activity log: every successful mutating request
 * (POST/PUT/PATCH/DELETE) on an audited resource writes an audit_logs row with
 * the acting user, action, resource, id, IP and user-agent. Fire-and-forget so
 * it never blocks or fails the request. Reads and unaudited resources are
 * skipped to keep the log signal-rich.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logAuditEvent } from '../services/audit-log/index.js';

// Only these top-level resources are audited (org configuration + sensitive
// actions). High-volume/ingestion routes (tracking, events, analytics) are not.
const AUDITED_RESOURCES = new Set([
  'campaigns',
  'contacts',
  'lists',
  'segments',
  'templates',
  'suppressions',
  'api-keys',
  'webhooks',
  'sending-domains',
  'domains',
  'configuration-sets',
  'senders',
  'ip-pools',
  'dedicated-ips',
  'members',
  'team',
  'users',
  'workflows',
  'automations',
  'integrations',
  'settings',
  'organization',
  'topics',
]);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Derive (resource, action) from a route pattern + method.
 *   POST   /api/v1/campaigns/:id/send  → campaigns, campaigns.send
 *   DELETE /api/v1/api-keys/:id         → api-keys, api-keys.deleted
 *   PATCH  /api/v1/contacts/:id         → contacts, contacts.updated
 * Returns null when the route is not an audited /api/v1 resource.
 */
export function deriveAudit(
  method: string,
  routeUrl: string,
): { resource: string; action: string } | null {
  const m = routeUrl.match(/^\/api\/v1\/([^/]+)(.*)$/);
  if (!m) return null;
  const resource = m[1]!;
  if (!AUDITED_RESOURCES.has(resource)) return null;

  const rest = m[2] ?? '';
  const segments = rest.split('/').filter(Boolean);
  const last = segments[segments.length - 1];

  // A trailing non-parameter segment is an explicit action verb (send, cancel…).
  if (last && !last.startsWith(':')) {
    return { resource, action: `${resource}.${last}` };
  }
  const verb =
    method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated';
  return { resource, action: `${resource}.${verb}` };
}

async function auditPlugin(app: FastifyInstance) {
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!req.user) return;
      if (!MUTATING.has(req.method)) return;
      // Only successful mutations (2xx/3xx). Failed attempts are not logged.
      if (reply.statusCode >= 400) return;

      const routeUrl = req.routeOptions?.url;
      if (!routeUrl) return;
      const derived = deriveAudit(req.method, routeUrl);
      if (!derived) return;

      const params = (req.params ?? {}) as Record<string, string>;
      const resourceId = params.id ?? params.batchId ?? params.campaignId ?? null;

      // Fire-and-forget — auditing must never block or fail the response.
      void logAuditEvent({
        orgId: req.user.orgId,
        userId: req.user.userId,
        action: derived.action,
        resource: derived.resource,
        resourceId,
        metadata: { method: req.method, path: routeUrl, status: reply.statusCode },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      }).catch(() => {});
    } catch {
      // never throw from an onResponse hook
    }
  });
}

export default fp(auditPlugin, { name: 'audit' });
