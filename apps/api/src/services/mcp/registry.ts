/**
 * MCP tool registry.
 *
 * The tools live here, in the API package, and `apps/mcp-server` is a thin
 * protocol shell that imports them — the same shape `apps/workers` already uses
 * for `@forgemsg/api/services/*`. Two reasons, and neither is tidiness:
 *
 *   1. A tool that lives in the MCP process can only be tested by starting that
 *      process. Here it is tested against the real routes and the real services,
 *      through the same Fastify app the integration suite already boots.
 *   2. The MCP process holds no business logic, so adding a tool never means
 *      touching the transport.
 *
 * WHAT A TOOL IS, HERE. Not one wrapper per endpoint. Klaviyo's server carries
 * roughly 200 endpoint-shaped tools and ships `core-tools-only=true` to cut it
 * to ~40 "if your client has a smaller context window or you want to improve
 * tool-selection accuracy" — their own documentation treats the full catalogue
 * as a problem to opt out of. A tool here answers a question somebody actually
 * asks ("how did my last few campaigns do?"), which is usually several
 * endpoints, and returns something an assistant can read rather than a raw
 * envelope.
 *
 * ORG SCOPE. A tool never takes an organisation id. It cannot: `call` carries
 * the API key, the API resolves the org FROM that key, and there is no
 * parameter that could say otherwise. That is deliberate — #123 and #131 were
 * both cases where an id in the request chose the tenant, and a tool surface is
 * the worst possible place to repeat it, because the caller is a language model
 * that will happily pass any id it has seen.
 */

import type { z } from 'zod';

/**
 * The one way a tool reaches the product.
 *
 * A seam rather than a bare `fetch` so the tests can drive the real Fastify app
 * with `app.inject` — real routes, real auth, real services, no mock of the
 * thing under test.
 */
export interface ToolTransport {
  (
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<{ status: number; body: unknown }>;
}

export interface ToolContext {
  call: ToolTransport;
}

export interface McpTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** Written for the model, not for a changelog: what it answers, and when. */
  description: string;
  input: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<string>;
}

/** Helper that keeps `input` and `run` inferring together. */
export function defineTool<S extends z.ZodTypeAny>(tool: McpTool<S>): McpTool {
  return tool as unknown as McpTool;
}

// ─── zod → JSON Schema ────────────────────────────────────────────────────────

export interface JsonSchema {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

/**
 * Convert the subset of zod these tools use into the JSON Schema MCP wants.
 *
 * Written rather than pulled in so the schema an assistant sees is derived from
 * the schema the handler parses with — one declaration, not two that drift. The
 * subset is deliberately small; an unsupported type throws at startup, loudly,
 * instead of being emitted as an untyped blob the model then guesses at.
 */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const shape = (
    schema as unknown as { _def: { shape?: () => Record<string, z.ZodTypeAny> } }
  )._def.shape?.();
  if (!shape) throw new Error('toJsonSchema: expected a z.object at the top level');

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [key, raw] of Object.entries(shape)) {
    let node: z.ZodTypeAny = raw;
    let optional = false;

    // Unwrap optional/default/nullable, remembering that it was optional.
    for (;;) {
      const name = (node as unknown as { _def: { typeName: string } })._def.typeName;
      if (name === 'ZodOptional' || name === 'ZodDefault' || name === 'ZodNullable') {
        optional = true;
        node = (node as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
        continue;
      }
      break;
    }

    const description = node.description ?? raw.description ?? '';
    const typeName = (node as unknown as { _def: { typeName: string } })._def.typeName;

    switch (typeName) {
      case 'ZodString':
        properties[key] = { type: 'string', description };
        break;
      case 'ZodNumber':
        properties[key] = { type: 'number', description };
        break;
      case 'ZodBoolean':
        properties[key] = { type: 'boolean', description };
        break;
      case 'ZodEnum':
        properties[key] = {
          type: 'string',
          description,
          enum: (node as unknown as { _def: { values: string[] } })._def.values,
        };
        break;
      case 'ZodArray': {
        const item = (node as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
        const itemType = (item as unknown as { _def: { typeName: string } })._def.typeName;
        if (itemType !== 'ZodString') {
          throw new Error(`toJsonSchema: only string arrays are supported (${key})`);
        }
        properties[key] = { type: 'array', description, items: { type: 'string' } };
        break;
      }
      default:
        throw new Error(`toJsonSchema: unsupported type ${typeName} for "${key}"`);
    }

    if (!optional) required.push(key);
  }

  return { type: 'object', properties, required };
}

// ─── Failure shape ────────────────────────────────────────────────────────────

/**
 * Raised when the product refuses. Carries the status so a tool can tell
 * "there is nothing there" from "that is not yours" — #122's lesson, and it
 * matters more here than anywhere: an assistant told "0 results" will report
 * that the campaign has no data, while "not found in your account" makes it
 * ask a better question.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Call the product, or throw with the reason the product gave. */
export async function expectOk(
  ctx: ToolContext,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const res = await ctx.call(path, method, body);
  if (res.status >= 400) {
    const detail =
      typeof res.body === 'object' && res.body !== null && 'message' in res.body
        ? String((res.body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ToolError(detail, res.status);
  }
  return res.body;
}
