/**
 * Serverless code runner for workflows (#346).
 *
 * Runs user-supplied JavaScript in an isolated Node `vm.Context` with
 * timeout, no access to `require`, `process`, `globalThis.fetch` or any of
 * the parent globals. Input is a serialisable value; the script's return
 * value (or the last expression) is captured.
 *
 * Security notes:
 *   - `vm.Context` is NOT a real security sandbox — a determined attacker
 *     can escape it. In production, plans that expose this feature should
 *     additionally run the worker in a separate OS user / container. This
 *     runner enforces: script size cap, execution timeout, a curated set of
 *     "safe" globals (Math, Date, JSON, URL, URLSearchParams, atob/btoa,
 *     TextEncoder/TextDecoder). No filesystem, no network, no timers.
 *   - Returned value is `structuredClone`d back to the caller to prevent
 *     prototype-pollution via shared references.
 *
 * Usage from workflows engine:
 *   const result = await runUserCode({
 *     orgId, script, input, timeoutMs: 2000, maxOutputBytes: 64 * 1024,
 *   });
 *   // Merge result.output into the workflow node's context.
 */

import vm from 'node:vm';

const MAX_SCRIPT_BYTES = 64 * 1024; // 64 KiB
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB
const DEFAULT_TIMEOUT_MS = 2_000;
const HARD_TIMEOUT_CEILING_MS = 10_000; // upper bound regardless of caller

export interface RunUserCodeInput {
  orgId: string;
  script: string;
  input?: unknown;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunUserCodeResult {
  ok: boolean;
  output?: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

function safeSandbox(input: unknown, logs: string[]): Record<string, unknown> {
  const console = {
    log: (...args: unknown[]) => {
      if (logs.length < 100) logs.push(args.map((a) => safeStringify(a)).join(' '));
    },
    info: (...args: unknown[]) => {
      if (logs.length < 100) logs.push(args.map((a) => safeStringify(a)).join(' '));
    },
    warn: (...args: unknown[]) => {
      if (logs.length < 100) logs.push(`[warn] ${args.map((a) => safeStringify(a)).join(' ')}`);
    },
    error: (...args: unknown[]) => {
      if (logs.length < 100) logs.push(`[error] ${args.map((a) => safeStringify(a)).join(' ')}`);
    },
  };

  return {
    input,
    console,
    // Curated globals — read-only-ish (we do NOT pass Object, Array, etc.;
    // they are available as language primitives inside the context).
    Math,
    JSON,
    Date,
    URL,
    URLSearchParams,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder,
    TextDecoder,
  };
}

function safeStringify(v: unknown): string {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function runUserCode(input: RunUserCodeInput): Promise<RunUserCodeResult> {
  const logs: string[] = [];
  const started = Date.now();

  if (!input.script || typeof input.script !== 'string') {
    return { ok: false, logs, durationMs: 0, error: 'Missing script' };
  }
  if (Buffer.byteLength(input.script, 'utf8') > MAX_SCRIPT_BYTES) {
    return { ok: false, logs, durationMs: 0, error: 'Script exceeds 64KiB limit' };
  }

  const timeout = Math.min(
    Math.max(100, input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    HARD_TIMEOUT_CEILING_MS,
  );

  // Wrap the user script in an async IIFE so `return` is valid and we can
  // await the result.
  const wrapped = `(async () => {\n${input.script}\n})()`;

  const sandbox = safeSandbox(input.input, logs);
  const ctx = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    const script = new vm.Script(wrapped);
    const result = script.runInContext(ctx, { timeout, breakOnSigint: true }) as
      | Promise<unknown>
      | unknown;

    const value = await Promise.race([
      Promise.resolve(result),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeout).unref(),
      ),
    ]);

    // Size-check + deep clone to detach from sandbox context.
    const serialized = safeStringify(value);
    const maxOut = input.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    if (Buffer.byteLength(serialized, 'utf8') > maxOut) {
      return {
        ok: false,
        logs,
        durationMs: Date.now() - started,
        error: `Output exceeds ${maxOut}-byte limit`,
      };
    }
    const cloned = JSON.parse(serialized) as unknown;

    return { ok: true, output: cloned, logs, durationMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      logs,
      durationMs: Date.now() - started,
      error: (err as Error).message ?? 'Unknown execution error',
    };
  }
}
