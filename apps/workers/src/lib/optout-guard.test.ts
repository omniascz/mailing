import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The send-path safety net, and why it exists alongside the renderer.
 *
 * The renderer is the barrier for block templates: it appends a compliance
 * footer when the template has none, so no template — existing or future — can
 * produce marketing HTML without an opt-out.
 *
 * It cannot reach one path. A campaign stored as legacy raw `{ html }` skips
 * renderEmail entirely (batch-sender.ts path 2: parseMergeTags on the stored
 * string, straight to the wire). There is no template to fix and no renderer
 * hook to add, so the check has to sit in the sending path.
 *
 * Asserted at source level because the guard lives inside a module that opens
 * Redis connections on import; the behaviour it enforces is one condition, and
 * what matters is that the condition is on the path and refuses rather than
 * skips.
 */

const SRC = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', 'jobs', 'batch-sender.ts'),
  'utf8',
);

describe('marketing mail with no opt-out is refused by the sender', () => {
  it('the guard runs on every rendered message', () => {
    expect(SRC).toContain('assertOptOutPresent(rendered.html, stream, unsubscribeUrl');
  });

  it('it throws rather than skipping the contact', () => {
    // Skipping would send the campaign to everyone whose render happened to
    // contain a link and silently drop the rest — the same violation, quieter.
    const guard = SRC.slice(
      SRC.indexOf('function assertOptOutPresent'),
      SRC.indexOf('interface RenderedEmail'),
    );
    expect(guard.length, 'guard not found').toBeGreaterThan(200);
    expect(guard).toContain('throw new Error(');
    expect(guard).not.toContain('return { skipped');
  });

  it('it lets transactional mail through', () => {
    const guard = SRC.slice(
      SRC.indexOf('function assertOptOutPresent'),
      SRC.indexOf('interface RenderedEmail'),
    );
    expect(guard).toContain("if (stream === 'transactional') return;");
  });

  it('it accepts either the resolved URL or the unresolved merge tag', () => {
    // The legacy path may carry {{unsubscribe_url}} that a later step resolves.
    const guard = SRC.slice(
      SRC.indexOf('function assertOptOutPresent'),
      SRC.indexOf('interface RenderedEmail'),
    );
    expect(guard).toContain('html.includes(unsubscribeUrl)');
    expect(guard).toContain('unsubscribe_url');
  });

  it('the campaign render is told which stream it is', () => {
    // Without this the renderer would default every campaign to marketing,
    // which is safe but would put an opt-out on transactional batches.
    expect(SRC).toContain('renderBlocks(parsed.data, { context: ctx, utm, stream })');
  });
});
