/**
 * Which suppression reasons stop a message, by stream and purpose.
 *
 * A transactional message is stopped by every reason but 'unsubscribe'; a list
 * DOI confirmation by the same reasons, with only the GDPR erasure row left
 * out (exceptErasureFor; Z148, narrowed to the erasure row in Z170); a flow's inline-HTML
 * e-mail, which is marketing on the transactional stream, by every reason
 * (Z152) — undefined, as for broadcast and triggered mail.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exceptErasureFor } from '../lib/suppression-reasons.js';

// Stand-ins for the modules that would open a Redis or gRPC connection on import.
vi.mock('@forgemsg/shared/redis', () => ({ redis: {} }));
vi.mock('../queues/index.js', () => ({ connection: {}, QUEUE_NAMES: {} }));
vi.mock('../lib/mta-grpc-client.js', () => ({ close: () => {}, send: async () => ({}) }));

const { reasonsFor } = await import('./mta-sender.js');

const TRANSACTIONAL = ['hard_bounce', 'complaint', 'manual', 'block', 'invalid_email'];

describe('reasonsFor', () => {
  it('transactional, no purpose: every reason but unsubscribe', () => {
    expect(reasonsFor({ stream: 'transactional' })).toEqual(TRANSACTIONAL);
  });

  // Z170: was TRANSACTIONAL without 'manual' (Z148). Rozhodnutí Michala
  // 14. 10. (a): výjimka jen pro GDPR hash — 'manual' counts again, and only
  // the erasure row is left out, by check-batch (exceptErasureFor below).
  it("transactional, doi_confirmation: every transactional reason, 'manual' included", () => {
    expect(reasonsFor({ stream: 'transactional', purpose: 'doi_confirmation' })).toEqual(
      TRANSACTIONAL,
    );
  });

  it('transactional, workflow_marketing: every reason, unsubscribe included', () => {
    expect(reasonsFor({ stream: 'transactional', purpose: 'workflow_marketing' })).toBeUndefined();
  });

  it('broadcast and triggered: every reason, whatever the purpose', () => {
    expect(reasonsFor({ stream: 'broadcast' })).toBeUndefined();
    expect(reasonsFor({ stream: 'triggered', purpose: 'doi_confirmation' })).toBeUndefined();
  });

  // Z158: the flow's transactional exception on the template branch travels on
  // the triggered stream and is stopped by exactly what stops it on the inline
  // branch (transactional stream, no purpose) — whatever the stream.
  it('flow_transactional: every reason but unsubscribe, on the triggered stream too', () => {
    expect(reasonsFor({ stream: 'triggered', purpose: 'flow_transactional' })).toEqual(
      TRANSACTIONAL,
    );
    expect(reasonsFor({ stream: 'transactional', purpose: 'flow_transactional' })).toEqual(
      reasonsFor({ stream: 'transactional' }),
    );
    expect(reasonsFor({ stream: 'broadcast', purpose: 'flow_transactional' })).toEqual(
      TRANSACTIONAL,
    );
  });

  it('triggered without a purpose: still every reason (unchanged)', () => {
    expect(reasonsFor({ stream: 'triggered' })).toBeUndefined();
  });
});

/**
 * Who skips the row a GDPR erasure leaves (Z170 — výjimka jen pro výmaz GDPR,
 * Michal 14. 10., varianta (a)). The list DOI confirmation, on the
 * transactional stream, and nothing else; and only mta-sender sends the
 * parameter that asks check-batch for it.
 */
describe('exceptErasureFor', () => {
  it('the list DOI confirmation on the transactional stream, and only it', () => {
    expect(exceptErasureFor({ stream: 'transactional', purpose: 'doi_confirmation' })).toBe(true);
    for (const data of [
      { stream: 'transactional' as const },
      { stream: 'transactional' as const, purpose: 'workflow_marketing' as const },
      { stream: 'transactional' as const, purpose: 'flow_transactional' as const },
      { stream: 'triggered' as const, purpose: 'doi_confirmation' as const },
      { stream: 'broadcast' as const, purpose: 'doi_confirmation' as const },
      { stream: 'triggered' as const, purpose: 'flow_transactional' as const },
      { stream: 'broadcast' as const },
    ]) {
      expect(exceptErasureFor(data), JSON.stringify(data)).toBe(false);
    }
  });

  it('no source file but mta-sender sends exceptErasure, and only check-batch reads it', () => {
    const apps = fileURLToPath(new URL('../../../', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|mjs)$/.test(path) && !/\.test\.tsx?$/.test(path)) files.push(path);
      }
    };
    for (const app of readdirSync(apps)) {
      const src = join(apps, app, 'src');
      if (existsSync(src)) walk(src);
    }
    const naming = files
      .filter((f) => /exceptErasure\s*:/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(apps, f).split(sep).join('/'))
      .sort();
    // The sender (mta-sender, behind exceptErasureFor) and the one route that reads it.
    expect(naming).toEqual([
      'api/src/routes/v1/internal/suppressions.ts',
      'workers/src/jobs/mta-sender.ts',
    ]);
    // Every app's source is read; on a cold disk that takes longer than 5 s.
  }, 60_000);
});
