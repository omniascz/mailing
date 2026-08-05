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

  // ─── Resource limits ───────────────────────────────────────────────────────
  // Neither guard below the constructor actually bounds work: the 1 MB output
  // check runs *after* the render finishes, and the 5 s Promise.race cannot
  // interrupt a synchronous CPU-bound render because that render is what is
  // blocking the event loop the timer lives on. Measured: a 106-byte template
  // (`{% for %}` nested 3 deep over 1..400) ran 25.6 s and peaked at 2 GB heap
  // before the output check fired. These are the limits that do the bounding.
  //
  // parseLimit — cap on template source parsed. Largest real templates
  // measured: 222 B (seeded campaign), 876 B (largest inline HTML literal in
  // apps/api), 3.7 KB (largest i18n email module). 500 KB leaves ~500x headroom
  // over anything observed and still covers a rich block-editor newsletter,
  // while staying under MAX_OUTPUT_BYTES so parse can never outgrow output.
  parseLimit: 500_000,
  // renderLimit — wall-clock budget per render, in ms. This is the one that
  // actually stops the nested-loop DoS.
  renderLimit: 1000,
  // memoryLimit — bytes tracked by liquidjs across the render.
  memoryLimit: 1e8, // 100 MB
  // Pinned rather than inherited: liquidjs currently defaults this to true, but
  // relying on a default means an upstream change silently re-opens prototype
  // chain access from user templates.
  ownPropertyOnly: true,
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
export function registerLiquidFilter(
  name: string,
  fn: (value: unknown, ...args: unknown[]) => unknown,
): void {
  engine.registerFilter(name, fn);
}

/**
 * Names of every filter the Liquid path can apply — LiquidJS builtins plus
 * anything registerLiquidFilter added. Read off the live engine rather than
 * a maintained list, so a filter that exists is never reported as a typo.
 */
export function listLiquidFilters(): string[] {
  return Object.keys((engine as unknown as { filters: Record<string, unknown> }).filters);
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
