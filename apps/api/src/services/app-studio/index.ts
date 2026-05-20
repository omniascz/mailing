/**
 * App Studio service — installs apps, manages subscribers/actions/triggers,
 * and provides the runtime helpers the workflow engine and webhook dispatcher
 * call into.
 */

import { and, asc, eq } from 'drizzle-orm';
import { createHash, randomBytes, createHmac } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  appStudioApps,
  appStudioWebhookSubscribers,
  appStudioActions,
  appStudioTriggers,
  type AppStudioApp,
  type AppStudioAction,
  type AppStudioTrigger,
} from '../../db/schema/app-studio.js';
import { AppError } from '../../lib/app-error.js';

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Apps ────────────────────────────────────────────────────────────────────

export interface InstallAppInput {
  orgId: string;
  slug: string;
  name: string;
  description?: string;
  iconUrl?: string;
  settingsSchema?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export async function installApp(
  input: InstallAppInput,
): Promise<{ app: AppStudioApp; accessToken: string }> {
  if (!SLUG_RE.test(input.slug)) throw AppError.badRequest('slug must be kebab-case');
  const accessToken = `as_${randomBytes(24).toString('hex')}`;
  try {
    const [app] = await db
      .insert(appStudioApps)
      .values({
        orgId: input.orgId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        iconUrl: input.iconUrl,
        settingsSchema: input.settingsSchema,
        settings: input.settings ?? {},
        accessTokenHash: hashToken(accessToken),
      })
      .returning();
    return { app: app!, accessToken };
  } catch (err) {
    if (String(err).includes('app_studio_apps_org_slug_idx')) {
      throw AppError.conflict(`App "${input.slug}" already installed`);
    }
    throw err;
  }
}

export async function listApps(orgId: string): Promise<AppStudioApp[]> {
  return db
    .select()
    .from(appStudioApps)
    .where(eq(appStudioApps.orgId, orgId))
    .orderBy(asc(appStudioApps.slug));
}

export async function getApp(orgId: string, idOrSlug: string): Promise<AppStudioApp> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const where = isUuid
    ? and(eq(appStudioApps.id, idOrSlug), eq(appStudioApps.orgId, orgId))
    : and(eq(appStudioApps.slug, idOrSlug), eq(appStudioApps.orgId, orgId));
  const [row] = await db.select().from(appStudioApps).where(where).limit(1);
  if (!row) throw AppError.notFound('App');
  return row;
}

export async function updateApp(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    iconUrl: string;
    settings: Record<string, unknown>;
    enabled: boolean;
  }>,
): Promise<AppStudioApp> {
  const [row] = await db
    .update(appStudioApps)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(appStudioApps.id, id), eq(appStudioApps.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('App');
  return row;
}

export async function uninstallApp(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(appStudioApps)
    .where(and(eq(appStudioApps.id, id), eq(appStudioApps.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('App');
}

export async function rotateAccessToken(
  orgId: string,
  id: string,
): Promise<{ accessToken: string }> {
  const accessToken = `as_${randomBytes(24).toString('hex')}`;
  const [row] = await db
    .update(appStudioApps)
    .set({ accessTokenHash: hashToken(accessToken), updatedAt: new Date() })
    .where(and(eq(appStudioApps.id, id), eq(appStudioApps.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('App');
  return { accessToken };
}

/** Resolve a Bearer token from an App Studio app installation. */
export async function authenticateApp(token: string): Promise<AppStudioApp | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(appStudioApps)
    .where(eq(appStudioApps.accessTokenHash, tokenHash))
    .limit(1);
  return row && row.enabled ? row : null;
}

// ─── Subscribers ─────────────────────────────────────────────────────────────

export async function addSubscriber(input: {
  orgId: string;
  appId: string;
  event: string;
  targetUrl: string;
}) {
  const secret = randomBytes(24).toString('hex');
  const [row] = await db
    .insert(appStudioWebhookSubscribers)
    .values({ ...input, secret })
    .returning();
  return row!;
}

export async function listSubscribers(orgId: string, appId: string) {
  return db
    .select()
    .from(appStudioWebhookSubscribers)
    .where(
      and(
        eq(appStudioWebhookSubscribers.orgId, orgId),
        eq(appStudioWebhookSubscribers.appId, appId),
      ),
    );
}

export async function removeSubscriber(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(appStudioWebhookSubscribers)
    .where(
      and(eq(appStudioWebhookSubscribers.id, id), eq(appStudioWebhookSubscribers.orgId, orgId)),
    )
    .returning();
  if (!row) throw AppError.notFound('Subscriber');
}

/**
 * Dispatch an event to all matching app subscribers. Returns the number of
 * deliveries attempted. Failures are logged in the row but don't throw —
 * the caller is the platform event bus, not an end-user.
 */
export async function dispatchToApps(
  orgId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const subs = await db
    .select()
    .from(appStudioWebhookSubscribers)
    .where(
      and(
        eq(appStudioWebhookSubscribers.orgId, orgId),
        eq(appStudioWebhookSubscribers.event, event),
        eq(appStudioWebhookSubscribers.enabled, true),
      ),
    );
  let count = 0;
  for (const s of subs) {
    const body = JSON.stringify({ event, orgId, payload, ts: Date.now() });
    const sig = createHmac('sha256', s.secret).update(body).digest('hex');
    let ok = false;
    try {
      const res = await fetch(s.targetUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forgemsg-signature': sig },
        body,
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    await db
      .update(appStudioWebhookSubscribers)
      .set({
        deliveryCount: s.deliveryCount + 1,
        failureCount: ok ? s.failureCount : s.failureCount + 1,
      })
      .where(eq(appStudioWebhookSubscribers.id, s.id));
    count++;
  }
  return count;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function defineAction(input: {
  orgId: string;
  appId: string;
  key: string;
  name: string;
  description?: string;
  method?: string;
  urlTemplate: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  paramSchema?: Record<string, unknown>;
  responsePath?: string;
}) {
  if (!SLUG_RE.test(input.key)) throw AppError.badRequest('action key must be kebab-case');
  try {
    const [row] = await db
      .insert(appStudioActions)
      .values({
        orgId: input.orgId,
        appId: input.appId,
        key: input.key,
        name: input.name,
        description: input.description,
        method: (input.method ?? 'POST').toUpperCase(),
        urlTemplate: input.urlTemplate,
        headers: input.headers ?? {},
        bodyTemplate: input.bodyTemplate,
        paramSchema: input.paramSchema,
        responsePath: input.responsePath,
      })
      .returning();
    return row!;
  } catch (err) {
    if (String(err).includes('app_studio_actions_app_key_idx')) {
      throw AppError.conflict(`Action "${input.key}" already exists for this app`);
    }
    throw err;
  }
}

export async function listActions(orgId: string, appId: string): Promise<AppStudioAction[]> {
  return db
    .select()
    .from(appStudioActions)
    .where(and(eq(appStudioActions.orgId, orgId), eq(appStudioActions.appId, appId)))
    .orderBy(asc(appStudioActions.key));
}

export async function deleteAction(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(appStudioActions)
    .where(and(eq(appStudioActions.id, id), eq(appStudioActions.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Action');
}

/**
 * Substitute merge tags in a string. Tags use double-curly syntax
 * `{{path.to.value}}`. Missing keys yield empty string.
 */
function substitute(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, path: string) => {
    const segs = path.split('.');
    let cur: unknown = ctx;
    for (const s of segs) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[s];
    }
    return cur == null ? '' : String(cur);
  });
}

function pickPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segs = path.split('.');
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

/**
 * Execute a previously-defined action. Returns the parsed JSON body (or text
 * fallback) after applying responsePath. Workflow nodes call this directly.
 */
export async function executeAction(
  orgId: string,
  actionKey: string,
  ctx: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const [action] = await db
    .select()
    .from(appStudioActions)
    .where(
      and(
        eq(appStudioActions.orgId, orgId),
        eq(appStudioActions.key, actionKey),
        eq(appStudioActions.enabled, true),
      ),
    )
    .limit(1);
  if (!action) throw AppError.notFound(`Action "${actionKey}"`);

  const url = substitute(action.urlTemplate, ctx);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(action.headers ?? {})) headers[k] = substitute(v, ctx);
  if (action.bodyTemplate && !headers['content-type']) headers['content-type'] = 'application/json';

  const res = await fetch(url, {
    method: action.method,
    headers,
    body: action.bodyTemplate ? substitute(action.bodyTemplate, ctx) : undefined,
  });

  let raw: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      raw = await res.json();
    } catch {
      raw = await res.text();
    }
  } else {
    raw = await res.text();
  }

  return {
    status: res.status,
    body: action.responsePath ? pickPath(raw, action.responsePath) : raw,
  };
}

// ─── Triggers ────────────────────────────────────────────────────────────────

export async function defineTrigger(input: {
  orgId: string;
  appId: string;
  key: string;
  name: string;
  eventName: string;
  payloadSchema?: Record<string, unknown>;
}): Promise<AppStudioTrigger> {
  if (!SLUG_RE.test(input.key)) throw AppError.badRequest('trigger key must be kebab-case');
  try {
    const [row] = await db.insert(appStudioTriggers).values(input).returning();
    return row!;
  } catch (err) {
    if (String(err).includes('app_studio_triggers_app_key_idx')) {
      throw AppError.conflict(`Trigger "${input.key}" already exists for this app`);
    }
    throw err;
  }
}

export async function listTriggers(orgId: string, appId: string): Promise<AppStudioTrigger[]> {
  return db
    .select()
    .from(appStudioTriggers)
    .where(and(eq(appStudioTriggers.orgId, orgId), eq(appStudioTriggers.appId, appId)))
    .orderBy(asc(appStudioTriggers.key));
}

export async function deleteTrigger(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(appStudioTriggers)
    .where(and(eq(appStudioTriggers.id, id), eq(appStudioTriggers.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Trigger');
}

/** Look up a trigger by app + key (used by the inbound webhook router). */
export async function findTrigger(
  orgId: string,
  appId: string,
  key: string,
): Promise<AppStudioTrigger | null> {
  const [row] = await db
    .select()
    .from(appStudioTriggers)
    .where(
      and(
        eq(appStudioTriggers.orgId, orgId),
        eq(appStudioTriggers.appId, appId),
        eq(appStudioTriggers.key, key),
        eq(appStudioTriggers.enabled, true),
      ),
    )
    .limit(1);
  return row ?? null;
}
