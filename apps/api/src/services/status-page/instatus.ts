/**
 * Instatus REST client (Sprint H.5).
 *
 * Instatus is a third-party status page (status.mailforge.io). We push
 * incidents to it whenever monitoring detects a service-level signal;
 * Instatus then handles subscriber email + SMS + Atom feed delivery.
 *
 * Auth: `Authorization: Bearer <INSTATUS_API_KEY>`
 * Base: `https://api.instatus.com/v1/{PAGE_ID}`
 *
 * Endpoints used:
 *   POST /incidents                     create
 *   PATCH /incidents/{id}               update status + components
 *   POST /incidents/{id}/incident-updates  append a timeline message
 *   GET  /incidents?status=open         list open incidents (for dedup)
 *
 * When `INSTATUS_API_KEY` is unset the client returns a no-op stub. This
 * keeps the dev experience tidy (no fake API calls in tests) and lets
 * the rest of the service shell stay unconditional.
 */

import type { ComponentSlug, IncidentImpact, IncidentStatus } from './pure.js';

const INSTATUS_API_BASE = 'https://api.instatus.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export interface InstatusCreateInput {
  name: string;
  message: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  components: ComponentSlug[];
  /** Sticks the incident to the affected components on the public page. */
  componentIds?: string[];
  /** Free-form metadata stored on the incident; we use this for our dedup key. */
  metadata?: Record<string, string>;
}

export interface InstatusUpdateInput {
  status?: IncidentStatus;
  /** Component status to set when transitioning the incident. */
  components?: { id: string; status: ComponentStatus }[];
}

export type ComponentStatus =
  | 'OPERATIONAL'
  | 'UNDERMAINTENANCE'
  | 'DEGRADEDPERFORMANCE'
  | 'PARTIALOUTAGE'
  | 'MAJOROUTAGE';

export interface InstatusIncident {
  id: string;
  name: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  createdAt: string;
  resolvedAt: string | null;
  metadata?: Record<string, string>;
}

export interface InstatusClient {
  readonly available: boolean;
  createIncident(input: InstatusCreateInput): Promise<InstatusIncident>;
  updateIncident(id: string, input: InstatusUpdateInput): Promise<void>;
  postUpdate(id: string, message: string, status?: IncidentStatus): Promise<void>;
  resolveIncident(id: string, message: string): Promise<void>;
  listOpenIncidents(): Promise<InstatusIncident[]>;
}

/** No-op client used in dev and tests when credentials are missing. */
export const noopClient: InstatusClient = {
  available: false,
  async createIncident(input) {
    return {
      id: `noop-${Date.now()}`,
      name: input.name,
      status: input.status,
      impact: input.impact,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      metadata: input.metadata,
    };
  },
  async updateIncident() {},
  async postUpdate() {},
  async resolveIncident() {},
  async listOpenIncidents() {
    return [];
  },
};

function http(apiKey: string, pageId: string) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return async function call<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${INSTATUS_API_BASE}/${pageId}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Instatus ${method} ${path} → ${res.status}: ${detail.slice(0, 200)}`);
    }
    // Some PATCH calls return 204
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };
}

export function createInstatusClient(apiKey: string, pageId: string): InstatusClient {
  const call = http(apiKey, pageId);

  return {
    available: true,

    async createIncident(input) {
      // Instatus expects component IDs (not slugs). We pass the slugs in
      // `metadata.components` so the operator dashboard shows them, and
      // rely on the caller to provide componentIds when present.
      const payload = {
        name: input.name,
        message: input.message,
        status: input.status,
        impact: input.impact,
        components: input.componentIds ?? [],
        metadata: {
          ...input.metadata,
          componentSlugs: input.components.join(','),
        },
      };
      const incident = await call<InstatusIncident>('POST', '/incidents', payload);
      return incident;
    },

    async updateIncident(id, input) {
      await call('PATCH', `/incidents/${id}`, input);
    },

    async postUpdate(id, message, status) {
      await call('POST', `/incidents/${id}/incident-updates`, { message, status });
    },

    async resolveIncident(id, message) {
      await call('POST', `/incidents/${id}/incident-updates`, {
        message,
        status: 'RESOLVED',
      });
    },

    async listOpenIncidents() {
      const rows = await call<InstatusIncident[]>('GET', '/incidents?status=open');
      return rows;
    },
  };
}

/**
 * Resolve which client to use at runtime. Pure on env so we can drop in
 * a fake in tests.
 */
export function selectClient(env: NodeJS.ProcessEnv = process.env): InstatusClient {
  const apiKey = env.INSTATUS_API_KEY;
  const pageId = env.INSTATUS_PAGE_ID;
  if (!apiKey || !pageId) return noopClient;
  return createInstatusClient(apiKey, pageId);
}
