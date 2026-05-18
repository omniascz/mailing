/**
 * ForgeMsg API client — fetch-based, TypeScript, zero external dependencies.
 */

import type { ForgemsgClientOptions, ListResponse, ItemResponse, PaginationOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.forgemsg.io';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30_000;

export class ForgemsgError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ForgemsgError';
  }
}

export class ForgemsgClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeout: number;

  constructor(opts: ForgemsgClientOptions) {
    if (!opts.apiKey) throw new Error('ForgeMsg SDK: apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  }

  // ─── HTTP ────────────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': '@forgemsg/sdk/0.1.0',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    // Retry on 429 (rate limit) and 5xx with exponential back-off
    if ((res.status === 429 || res.status >= 500) && retries < this.maxRetries) {
      const delay = Math.min(200 * Math.pow(2, retries), 5000);
      await new Promise((r) => setTimeout(r, delay));
      return this.request<T>(method, path, body, retries + 1);
    }

    if (!res.ok) {
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = await res.json() as Record<string, unknown>;
      } catch {
        // ignore
      }
      throw new ForgemsgError(
        res.status,
        String(errorBody['code'] ?? 'API_ERROR'),
        String(errorBody['message'] ?? `HTTP ${res.status}`),
      );
    }

    if (res.status === 204) return undefined as T;
    return res.json() as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ─── Pagination helper ───────────────────────────────────────────────────────

  /**
   * Iterates all pages of a list endpoint, yielding batches.
   * Usage: for await (const batch of client.paginate('/api/v1/contacts')) { ... }
   */
  async *paginate<T>(path: string, pageSize = 100): AsyncGenerator<T[], void, unknown> {
    let cursor: string | undefined;
    const sep = path.includes('?') ? '&' : '?';

    while (true) {
      const url = cursor
        ? `${path}${sep}limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
        : `${path}${sep}limit=${pageSize}`;

      const page = await this.get<ListResponse<T>>(url);
      yield page.data;

      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
  }
}
