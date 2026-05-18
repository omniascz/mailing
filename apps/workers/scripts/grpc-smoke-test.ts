/**
 * gRPC smoke test — verifies workers can reach the Go MTA engine over gRPC.
 *
 * Prereqs:
 *   1. Build engine: cd ../engine && go build -o engine.exe
 *   2. Run engine: ./engine.exe (listens on :50051 by default)
 *
 * Then from workers package:
 *   pnpm tsx scripts/grpc-smoke-test.ts
 *
 * Expected success output:
 *   { healthy: true, activeConnections: 0, poolSize: 0, version: '0.1.0' }
 *
 * Expected failure if engine not running:
 *   UNAVAILABLE: No connection established
 */

import { healthCheck, close } from '../src/lib/mta-grpc-client.js';

const start = Date.now();

try {
  const res = await healthCheck(3_000);
  const ms = Date.now() - start;
  console.log(`[OK] HealthCheck succeeded in ${ms}ms:`);
  console.log(JSON.stringify(res, null, 2));
  close();
  process.exit(0);
} catch (err) {
  const ms = Date.now() - start;
  const e = err as Error & { code?: number; details?: string };
  console.error(`[FAIL] HealthCheck failed after ${ms}ms`);
  console.error(`  code: ${e.code}`);
  console.error(`  details: ${e.details ?? e.message}`);
  close();
  process.exit(1);
}
