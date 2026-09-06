/**
 * ForgeMsg MCP Server — the protocol shell.
 *
 * The tools themselves live in `@forgemsg/api/services/mcp`, the same way
 * apps/workers reaches into the API package. This file speaks JSON-RPC over
 * stdio and nothing else: it holds no business logic, so adding a tool never
 * means touching the transport, and every tool is tested against the real
 * routes in the API's own integration suite rather than by starting this
 * process.
 *
 * WHAT CHANGED, AND WHY IT MATTERS. The server used to authenticate with
 *
 *     Authorization: Bearer <api key>
 *     X-Org-Id: <org id>
 *
 * The API reads `Authorization: Bearer` as a JWT session token and API keys
 * from `X-API-Key`, so an `fm_live_` key in the Bearer slot failed session
 * verification and `request.user` stayed unset. Measured against a real key on
 * a real server:
 *
 *     Authorization: Bearer fm_live_…   ->  401
 *     X-API-Key: fm_live_…              ->  200
 *
 * Every one of the six tools answered 401. The count was never "6 versus
 * Klaviyo's 260" — it was zero.
 *
 * `X-Org-Id` is gone rather than corrected. No route outside the FBL webhook
 * reads it, and a header that names the tenant is exactly the shape #123 and
 * #131 were about: the org must come from the credential, never from a field
 * the caller sets. There is now no way for a tool, or a model calling one, to
 * ask for another organisation's data.
 *
 * Usage:
 *   node dist/index.js --api-key <key> [--api-url <url>]
 */

import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { describeTools, findTool, type ToolContext } from '@forgemsg/api/services/mcp';

// ─── MCP protocol types ───────────────────────────────────────────────────────

interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = cliArgs.indexOf(flag);
  return idx !== -1 ? cliArgs[idx + 1] : undefined;
};

const API_KEY = getArg('--api-key') ?? process.env.FORGEMSG_API_KEY ?? '';
const API_URL = getArg('--api-url') ?? process.env.FORGEMSG_API_URL ?? 'http://localhost:3001';

// ─── Transport ────────────────────────────────────────────────────────────────

const ctx: ToolContext = {
  async call(path, method, body) {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // The key, and only the key. The org is whatever this key belongs to.
        'X-API-Key': API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const parsed = await response.json().catch(() => ({}));
    return { status: response.status, body: parsed };
  },
};

// ─── Protocol handler ─────────────────────────────────────────────────────────

async function handleRequest(req: McpRequest): Promise<McpResponse> {
  const respond = (result: unknown): McpResponse => ({ jsonrpc: '2.0', id: req.id, result });
  const respondError = (code: number, message: string): McpResponse => ({
    jsonrpc: '2.0',
    id: req.id,
    error: { code, message },
  });

  try {
    switch (req.method) {
      case 'initialize':
        return respond({
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'forgemsg-mcp', version: '0.2.0' },
          capabilities: { tools: {} },
        });

      case 'tools/list':
        return respond({ tools: describeTools() });

      case 'tools/call': {
        const { name, arguments: toolArgs } = req.params as {
          name: string;
          arguments: Record<string, unknown>;
        };
        const tool = findTool(name);
        if (!tool) return respondError(-32602, `Unknown tool: ${name}`);

        // Parsed against the same schema the model was shown, so a bad argument
        // is named here rather than becoming a confusing API error later.
        const parsed = tool.input.safeParse(toolArgs ?? {});
        if (!parsed.success) {
          return respondError(-32602, `Invalid arguments for ${name}: ${parsed.error.message}`);
        }

        const content = await tool.run(parsed.data, ctx);
        return respond({ content: [{ type: 'text', text: content }] });
      }

      case 'ping':
        return respond({});

      default:
        return respondError(-32601, `Method not found: ${req.method}`);
    }
  } catch (err) {
    return respondError(-32000, (err as Error).message);
  }
}

// ─── Stdio transport ──────────────────────────────────────────────────────────

async function startStdioServer(input: Readable, output: Writable): Promise<void> {
  const rl = createInterface({ input, terminal: false });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line) as McpRequest;
      const res = await handleRequest(req);
      output.write(JSON.stringify(res) + '\n');
    } catch {
      const errRes: McpResponse = {
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32700, message: 'Parse error' },
      };
      output.write(JSON.stringify(errRes) + '\n');
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (!API_KEY) {
  process.stderr.write('ForgeMsg MCP Server: missing --api-key\n');
  process.stderr.write('Usage: node dist/index.js --api-key <apiKey> [--api-url <url>]\n');
  process.exit(1);
}

process.stderr.write(`ForgeMsg MCP Server started (api: ${API_URL})\n`);
await startStdioServer(process.stdin, process.stdout);
