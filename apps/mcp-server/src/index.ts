/**
 * ForgeMsg MCP Server
 *
 * Exposes MailForge API tools for AI assistants (Claude, ChatGPT etc.)
 * via the Model Context Protocol (MCP).
 *
 * Tools exposed:
 *   - send_email       — send transactional email
 *   - send_sms         — send transactional SMS
 *   - create_contact   — create/upsert contact
 *   - query_segments   — list segments matching criteria
 *   - get_campaign     — get campaign stats
 *   - create_campaign  — create draft campaign
 *
 * Transport: stdio (compatible with Claude Desktop, Cursor, etc.)
 *
 * Usage:
 *   node dist/index.js --org-id <orgId> --api-key <key> --api-url <url>
 */

import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';

// ─── MCP Protocol types ───────────────────────────────────────────────────────

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

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

const ORG_ID = getArg('--org-id') ?? process.env.FORGEMSG_ORG_ID ?? '';
const API_KEY = getArg('--api-key') ?? process.env.FORGEMSG_API_KEY ?? '';
const API_URL = getArg('--api-url') ?? process.env.FORGEMSG_API_URL ?? 'http://localhost:3001';

// ─── Tools definition ─────────────────────────────────────────────────────────

const TOOLS: McpTool[] = [
  {
    name: 'send_email',
    description: 'Send a transactional email to a contact via MailForge',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        html: { type: 'string', description: 'HTML body of the email' },
        text: { type: 'string', description: 'Plain text body (optional fallback)' },
        from_name: { type: 'string', description: 'Sender display name' },
      },
      required: ['to', 'subject', 'html'],
    },
  },
  {
    name: 'send_sms',
    description: 'Send a transactional SMS to a phone number via MailForge',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient phone number in E.164 format (+420...)' },
        body: { type: 'string', description: 'SMS message body (max 160 chars for single SMS)' },
        sender_id: { type: 'string', description: 'Sender ID or short code (optional)' },
      },
      required: ['to', 'body'],
    },
  },
  {
    name: 'create_contact',
    description:
      'Create or upsert a contact in MailForge. If contact with this email exists, it will be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address' },
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        phone: { type: 'string', description: 'Phone in E.164 format' },
        tags: { type: 'string', description: 'Comma-separated list of tags to add' },
      },
      required: ['email'],
    },
  },
  {
    name: 'query_segments',
    description: 'List segments in MailForge, optionally filtered by name',
    inputSchema: {
      type: 'object',
      properties: {
        name_contains: {
          type: 'string',
          description: 'Filter segments whose name contains this string',
        },
        limit: { type: 'string', description: 'Max number of segments to return (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_campaign',
    description: 'Get details and stats for a specific campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign UUID' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a draft email campaign in MailForge',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        from_name: { type: 'string', description: 'Sender display name' },
        from_email: { type: 'string', description: 'Sender email address' },
        html: { type: 'string', description: 'Email HTML content' },
        segment_id: { type: 'string', description: 'Target segment UUID (optional)' },
      },
      required: ['name', 'subject', 'from_name', 'from_email'],
    },
  },
];

// ─── API caller ───────────────────────────────────────────────────────────────

async function callApi(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Org-Id': ORG_ID,
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'send_email':
      await callApi('/api/v1/transactional/email', 'POST', {
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        fromName: input.from_name,
      });
      return `Email sent successfully to ${input.to as string}`;

    case 'send_sms':
      await callApi('/api/v1/transactional/sms', 'POST', {
        to: input.to,
        body: input.body,
        senderId: input.sender_id,
      });
      return `SMS sent successfully to ${input.to as string}`;

    case 'create_contact': {
      const tags = input.tags ? (input.tags as string).split(',').map((t) => t.trim()) : [];
      const result = await callApi('/api/v1/contacts', 'POST', {
        email: input.email,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone,
        tags,
      });
      return `Contact created/updated: ${JSON.stringify(result)}`;
    }

    case 'query_segments': {
      const limit = parseInt((input.limit as string | undefined) ?? '10', 10);
      const result = (await callApi(
        `/api/v1/segments?limit=${limit}${input.name_contains ? `&search=${encodeURIComponent(input.name_contains as string)}` : ''}`,
        'GET',
      )) as { data: unknown[] };
      return `Found ${result.data?.length ?? 0} segments: ${JSON.stringify(result.data)}`;
    }

    case 'get_campaign': {
      const result = await callApi(`/api/v1/campaigns/${input.campaign_id as string}`, 'GET');
      return JSON.stringify(result);
    }

    case 'create_campaign': {
      const result = await callApi('/api/v1/campaigns', 'POST', {
        name: input.name,
        subject: input.subject,
        fromName: input.from_name,
        fromEmail: input.from_email,
        type: 'email',
        content: { html: (input.html as string | undefined) ?? '' },
        segmentId: input.segment_id,
      });
      return `Campaign created: ${JSON.stringify(result)}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Protocol handler ─────────────────────────────────────────────────────

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
          serverInfo: { name: 'forgemsg-mcp', version: '0.1.0' },
          capabilities: { tools: {} },
        });

      case 'tools/list':
        return respond({ tools: TOOLS });

      case 'tools/call': {
        const { name, arguments: toolArgs } = req.params as {
          name: string;
          arguments: Record<string, unknown>;
        };
        const content = await executeTool(name, toolArgs);
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

if (!ORG_ID || !API_KEY) {
  process.stderr.write('ForgeMsg MCP Server: missing --org-id or --api-key\n');
  process.stderr.write(
    'Usage: node dist/index.js --org-id <orgId> --api-key <apiKey> [--api-url <url>]\n',
  );
  process.exit(1);
}

process.stderr.write(`ForgeMsg MCP Server started (org: ${ORG_ID}, api: ${API_URL})\n`);
await startStdioServer(process.stdin, process.stdout);
