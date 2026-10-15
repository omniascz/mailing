/**
 * Which suppression reasons stop a message, by stream and purpose.
 *
 * A transactional message is stopped by every reason but 'unsubscribe'; a list
 * DOI confirmation by those without 'manual' (Z148); a flow's inline-HTML
 * e-mail, which is marketing on the transactional stream, by every reason
 * (Z152) — undefined, as for broadcast and triggered mail.
 */
import { describe, it, expect, vi } from 'vitest';

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

  it("transactional, doi_confirmation: the transactional ones without 'manual'", () => {
    expect(reasonsFor({ stream: 'transactional', purpose: 'doi_confirmation' })).toEqual(
      TRANSACTIONAL.filter((r) => r !== 'manual'),
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
