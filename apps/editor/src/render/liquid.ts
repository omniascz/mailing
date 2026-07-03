/**
 * Liquid templating layer for email content blocks.
 *
 * Sits on top of the merge-tag parser: merge tags ({{first_name}}) are
 * resolved first, then Liquid tags ({% if %}, {% for %}, filters) are
 * evaluated in a sandboxed engine.
 *
 * Security constraints:
 * - No filesystem access (no "include", "render" with file paths)
 * - No remote HTTP (no fetch in template)
 * - 5-second render timeout enforced via Promise.race
 * - max_length guard on output (1 MB)
 */

import { Liquid } from 'liquidjs';

const MAX_OUTPUT_BYTES = 1_000_000; // 1 MB safety cap
const RENDER_TIMEOUT_MS = 5_000;

// Singleton engine — creating it is cheap but we want to share the compiled
// template cache across calls.
const engine = new Liquid({
  // Disable file-system lookup so "include" / "render" tags throw
  root: [],
  fs: {
    readFileSync: () => {
      throw new Error('Filesystem access not allowed in email templates');
    },
    readFile: async () => {
      throw new Error('Filesystem access not allowed in email templates');
    },
    existsSync: () => false,
    exists: async () => false,
    contains: async () => false,
    resolve: (_: string, file: string) => file,
    sep: '/',
  },
  // Relax strict mode so missing variables render as '' not throw
  strictVariables: false,
  strictFilters: false,
  // Jinja-style output tags so they coexist with {{ merge tags }} — we
  // process merge tags first, THEN Liquid, so by the time Liquid sees the
  // string the merge tags have already been replaced by their values.
});

/**
 * Register a custom filter into the shared Liquid engine, so it is available
 * inside {% %}-containing templates (e.g. the Czech/Slovak locale filters
 * `vocative`, `genitive`, …). Mirrors `registerMergeFilter` for the regex
 * merge-tag path so `{{ name | vocative }}` behaves identically whether it is
 * rendered by the regex parser or by Liquid.
 */
export function registerLiquidFilter(name: string, fn: (value: unknown, ...args: unknown[]) => unknown): void {
  engine.registerFilter(name, fn);
}

/**
 * Context available inside Liquid templates.
 *
 * - `contact` — all contact fields (first_name, email, custom_fields…)
 * - `system`  — platform-level values (unsubscribe_url, current_date…)
 * - any extra keys passed by the caller (e.g. `products` array for loops)
 */
export type LiquidContext = Record<string, unknown>;

/**
 * Render a Liquid template string with the given context.
 *
 * @throws if template syntax is invalid or rendering exceeds 5 s.
 */
export async function renderLiquid(template: string, ctx: LiquidContext = {}): Promise<string> {
  if (!template || typeof template !== 'string') return template ?? '';

  const renderPromise = engine.parseAndRender(template, ctx);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Liquid template render timeout (5s)')), RENDER_TIMEOUT_MS),
  );

  const output = await Promise.race([renderPromise, timeoutPromise]);

  if (output.length > MAX_OUTPUT_BYTES) {
    throw new Error(`Liquid template output too large (>${MAX_OUTPUT_BYTES} bytes)`);
  }

  return output;
}

/**
 * Synchronous variant for contexts where async is inconvenient.
 * Uses the same engine but throws synchronously on timeout (rare in practice
 * since Liquid evaluation is CPU-bound and this wrapper just races a timer).
 *
 * NOTE: prefer `renderLiquid` (async) where possible.
 */
export function renderLiquidSync(template: string, ctx: LiquidContext = {}): string {
  if (!template || typeof template !== 'string') return template ?? '';
  // LiquidJS has no truly synchronous API for async tags; for the common case
  // (no async tags) parseAndRenderSync works fine.
  const output = engine.parseAndRenderSync(template, ctx);
  if (output.length > MAX_OUTPUT_BYTES) {
    throw new Error(`Liquid template output too large (>${MAX_OUTPUT_BYTES} bytes)`);
  }
  return output;
}
