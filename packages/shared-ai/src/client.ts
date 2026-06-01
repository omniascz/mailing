/**
 * Claude API client — framework-agnostic, with caching, cost tracking, retries.
 *
 * Uses native fetch() — works in Node.js 18+, Bun, Deno.
 * No dependency on @anthropic-ai/sdk (but compatible — projects can use either).
 */
import { createHash } from 'node:crypto';
import {
  MODEL_COSTS,
  MODEL_ALIASES,
  type ModelAlias,
  type AiProviderConfig,
  type CallClaudeOptions,
  type CallClaudeResult,
  type ClaudeApiResponse,
} from './types.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_CACHE_TTL = 60 * 60 * 24; // 24h
const DEFAULT_MAX_RETRIES = 3;

/**
 * Minimum system-prompt length for Anthropic prompt caching to be worth it.
 * Anthropic charges a 25% premium on cache writes; cached reads are 10% of
 * the normal input price. Break-even is the system prompt being reused once.
 * We trigger the cache for any system prompt >= 1024 characters (~256 tokens)
 * — below that the savings are noise and the cache-write surcharge dominates.
 */
const PROMPT_CACHE_MIN_SYSTEM_CHARS = 1024;

// ─── Cost calculation ────────────────────────────────────────────────────────

/**
 * Calculate the cost in USD for a given model and token counts.
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const resolvedModel = resolveModel(model);
  const costs = MODEL_COSTS[resolvedModel] ?? MODEL_COSTS['claude-sonnet-4-6']!;
  return (
    (inputTokens / 1_000_000) * costs.inputPerMTok +
    (outputTokens / 1_000_000) * costs.outputPerMTok
  );
}

// ─── Cache key ───────────────────────────────────────────────────────────────

/**
 * Generate a deterministic cache key from feature + prompt parts.
 * Format: ai:{feature}:{sha256(parts joined by |)}
 */
export function cacheKey(feature: string, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('|')).digest('hex');
  return `ai:${feature}:${hash}`;
}

// ─── Model resolution ────────────────────────────────────────────────────────

/**
 * Resolve model alias ('sonnet', 'haiku', 'opus') to full model ID.
 * Passes through full IDs unchanged.
 */
export function resolveModel(modelOrAlias: string): string {
  if (modelOrAlias in MODEL_ALIASES) {
    return MODEL_ALIASES[modelOrAlias as ModelAlias];
  }
  return modelOrAlias;
}

// ─── JSON parsing helper ─────────────────────────────────────────────────────

/**
 * Safely parse JSON from Claude's response, stripping markdown fences.
 */
export function parseJsonSafe<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// ─── Main client ─────────────────────────────────────────────────────────────

/**
 * Create a configured Claude API client.
 *
 * Returns a `callClaude` function that handles:
 * - Model alias resolution
 * - Redis caching (if cache adapter provided)
 * - Rate limiting (if rate limiter provided)
 * - Usage tracking (if usage tracker provided)
 * - Retry with exponential backoff on transient errors
 * - Cost calculation
 */
export function createAiClient(config: AiProviderConfig = {}) {
  const apiBaseUrl = config.apiBaseUrl ?? ANTHROPIC_API_URL;
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
  const cacheTtlSec = config.cacheTtlSec ?? DEFAULT_CACHE_TTL;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

  function getApiKey(): string {
    const key = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('AI features require ANTHROPIC_API_KEY environment variable');
    }
    return key;
  }

  async function callClaude(opts: CallClaudeOptions): Promise<CallClaudeResult> {
    const model = resolveModel(opts.model);
    const feature = opts.feature ?? 'other';
    const tenantId = opts.tenantId;

    // 1. Rate limiting
    if (tenantId && config.rateLimiter) {
      await config.rateLimiter(tenantId, feature);
    }

    // 2. Cache lookup
    if (!opts.noCache && config.cache) {
      const key = cacheKey(feature, opts.system.slice(0, 100), opts.user.slice(0, 300));
      const cached = await config.cache.get(key);
      if (cached) {
        // Track cached usage
        if (tenantId && config.usageTracker) {
          Promise.resolve(
            config.usageTracker({
              tenantId,
              model,
              feature,
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
              cached: true,
            }),
          ).catch(() => {});
        }
        return { text: cached, cached: true, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
    }

    // 3. Call Claude API with retries
    const apiKey = getApiKey();
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Anthropic prompt caching: for any non-trivial system prompt we
        // wrap it as a structured content block with cache_control. Claude
        // re-uses the cached system tokens for 5 minutes, charging only 10%
        // of normal input price on a hit. Subsequent calls within that
        // window with the same system prompt save ~90% on system tokens.
        const useCacheControl = opts.system.length >= PROMPT_CACHE_MIN_SYSTEM_CHARS;
        const systemField = useCacheControl
          ? [
              {
                type: 'text' as const,
                text: opts.system,
                cache_control: { type: 'ephemeral' as const },
              },
            ]
          : opts.system;

        const body: Record<string, unknown> = {
          model,
          max_tokens: opts.maxTokens ?? defaultMaxTokens,
          system: systemField,
          messages: [{ role: 'user', content: opts.user }],
          ...opts.extra,
        };

        const response = await fetch(apiBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': apiVersion,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const status = response.status;
          if ((status === 429 || status === 500 || status === 529) && attempt < maxRetries - 1) {
            const delay = Math.min(1000 * 2 ** attempt, 30_000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          const errText = await response.text().catch(() => '');
          throw new Error(`Claude API error ${status}: ${errText.slice(0, 200)}`);
        }

        const result = (await response.json()) as ClaudeApiResponse;

        // Extract text from content blocks
        const text = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');

        // Anthropic returns split usage when prompt caching is used:
        //   input_tokens                — fresh input not served from cache
        //   cache_creation_input_tokens — wrote to cache this turn (1.25×)
        //   cache_read_input_tokens     — served from cache this turn (0.10×)
        const usage = result.usage as
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            }
          | undefined;
        const freshInput = usage?.input_tokens ?? 0;
        const cacheWriteInput = usage?.cache_creation_input_tokens ?? 0;
        const cacheReadInput = usage?.cache_read_input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        // Cost: fresh input at 1×, cache write at 1.25×, cache read at 0.10×.
        const baseInputCost = calculateCost(model, freshInput, 0);
        const cacheWriteCost = calculateCost(model, cacheWriteInput, 0) * 1.25;
        const cacheReadCost = calculateCost(model, cacheReadInput, 0) * 0.1;
        const outputCost = calculateCost(model, 0, outputTokens);
        const costUsd = baseInputCost + cacheWriteCost + cacheReadCost + outputCost;
        const inputTokens = freshInput + cacheWriteInput + cacheReadInput;

        // 4. Cache the response
        if (!opts.noCache && config.cache) {
          const key = cacheKey(feature, opts.system.slice(0, 100), opts.user.slice(0, 300));
          await config.cache.setex(key, cacheTtlSec, text).catch(() => {});
        }

        // 5. Track usage (fire-and-forget)
        if (tenantId && config.usageTracker) {
          Promise.resolve(
            config.usageTracker({
              tenantId,
              model,
              feature,
              inputTokens,
              outputTokens,
              costUsd,
              cached: false,
            }),
          ).catch(() => {});
        }

        return { text, cached: false, inputTokens, outputTokens, costUsd, rawResponse: result };
      } catch (err) {
        lastError = err;
        // Only retry on transient-looking errors
        const message = err instanceof Error ? err.message : '';
        if (message.includes('429') || message.includes('500') || message.includes('529')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.min(1000 * 2 ** attempt, 30_000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  return { callClaude };
}
