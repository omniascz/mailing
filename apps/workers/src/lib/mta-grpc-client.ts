/**
 * gRPC client for the Go MTA engine (apps/engine).
 *
 * Loads proto dynamically via @grpc/proto-loader (no codegen required).
 * Endpoint configured via MTA_GRPC_ENDPOINT env var (default: localhost:50051).
 *
 * Exposes:
 *   - send(req): single message
 *   - sendBatch(reqs): batched send (up to 20 concurrent on engine side)
 *   - healthCheck(): liveness + pool stats
 *   - close(): tear down client connection (for graceful shutdown)
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Proto lives in apps/engine/proto/mta.proto (sibling to apps/workers)
// At runtime (built JS) __dirname is apps/workers/dist/lib, so we walk up 3 levels.
// In dev (tsx) __dirname is apps/workers/src/lib, so we walk up 3 levels too.
const PROTO_PATH = resolve(__dirname, '..', '..', '..', 'engine', 'proto', 'mta.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // snake_case → camelCase
  longs: String, // int64 → string (JS numbers lose precision above 2^53)
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  mta: { MTAService: grpc.ServiceClientConstructor };
};

const MTAServiceCtor = protoDescriptor.mta.MTAService;

// ─── Types (mirror proto SendRequest/SendResponse) ───────────────────────────

export interface DkimConfig {
  domain: string;
  selector: string;
  privateKeyPem: string;
}

export interface SendRequest {
  messageId: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo: string;
  dkim?: DkimConfig;
  customHeaders: Record<string, string>;
  orgId: string;
  campaignId: string;
  contactId: string;
  sendingIp: string;
}

export interface SendResponse {
  success: boolean;
  messageId: string;
  smtpCode: number;
  smtpMessage: string;
  error: string;
  /** int64 → string (e.g. "123") */
  durationMs: string;
}

export interface SendBatchRequest {
  messages: SendRequest[];
}

export interface SendBatchResponse {
  results: SendResponse[];
  totalSent: number;
  totalFailed: number;
}

export interface HealthCheckResponse {
  healthy: boolean;
  activeConnections: number;
  poolSize: number;
  version: string;
}

// ─── Client lifecycle ────────────────────────────────────────────────────────

let client: grpc.Client | null = null;

function getClient(): grpc.Client {
  if (client) return client;
  const endpoint = process.env.MTA_GRPC_ENDPOINT ?? 'localhost:50051';
  // Insecure for now; TLS via envoy/proxy in production.
  client = new MTAServiceCtor(endpoint, grpc.credentials.createInsecure(), {
    'grpc.max_receive_message_length': 16 * 1024 * 1024,
    'grpc.max_send_message_length': 16 * 1024 * 1024,
    'grpc.keepalive_time_ms': 30_000,
    'grpc.keepalive_timeout_ms': 10_000,
    'grpc.http2.max_pings_without_data': 0,
  });
  return client;
}

function makeDeadline(ms: number): grpc.Deadline {
  return new Date(Date.now() + ms);
}

function unaryCall<TReq, TRes>(method: string, req: TReq, timeoutMs: number): Promise<TRes> {
  return new Promise((resolveCb, rejectCb) => {
    // grpc-js dynamic client exposes RPCs as methods on the instance.
    const c = getClient() as unknown as Record<
      string,
      (
        req: TReq,
        opts: { deadline: grpc.Deadline },
        cb: (err: grpc.ServiceError | null, res: TRes) => void,
      ) => void
    >;
    const fn = c[method];
    if (!fn) {
      rejectCb(new Error(`gRPC method not found: ${method}`));
      return;
    }
    fn.call(c, req, { deadline: makeDeadline(timeoutMs) }, (err, res) => {
      if (err) rejectCb(err);
      else resolveCb(res);
    });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function send(req: SendRequest, timeoutMs = 60_000): Promise<SendResponse> {
  return unaryCall<SendRequest, SendResponse>('Send', req, timeoutMs);
}

export function sendBatch(req: SendBatchRequest, timeoutMs = 120_000): Promise<SendBatchResponse> {
  return unaryCall<SendBatchRequest, SendBatchResponse>('SendBatch', req, timeoutMs);
}

export function healthCheck(timeoutMs = 5_000): Promise<HealthCheckResponse> {
  return unaryCall<Record<string, never>, HealthCheckResponse>('HealthCheck', {}, timeoutMs);
}

export function close(): void {
  if (client) {
    client.close();
    client = null;
  }
}
