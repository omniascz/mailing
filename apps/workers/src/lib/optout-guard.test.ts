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
 * It cannot reach one path. A campaign stored as raw `{ html }` skips
 * renderEmail entirely (batch-sender.ts path 2: parseMergeTags on the stored
 * string, straight to the wire). There is no template to fix and no renderer
 * hook to add, so the check has to sit in the sending path.
 *
 * That path is now genuinely only raw HTML. It used to catch the visual
 * editor's `{ schema, html }` too, because the branch above tested
 * `'blocks' in content` — so this guard was the thing refusing the product's
 * own campaigns, and its message told the operator they had written a
 * raw-HTML campaign when they had not.
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
    expect(SRC).toContain('assertOptOutPresent(rendered, stream, unsubscribeUrl');
  });

  it('it looks at both parts of the multipart, not only the HTML', () => {
    // The whole point of the guard is that the message is lawful. A text
    // alternative with no way out is the same violation, in the half a filter
    // reads when it scores the mail.
    const guard = SRC.slice(
      SRC.indexOf('function assertOptOutPresent'),
      SRC.indexOf('interface RenderedEmail'),
    );
    expect(guard).toContain("(['html', 'text'] as const)");
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
    expect(guard).toContain('rendered[part].includes(unsubscribeUrl)');
    expect(guard).toContain('UNRESOLVED_OPT_OUT_TAG.test(rendered[part])');
    // And that pattern has to keep its escapes. An earlier inline version had
    // lost them — `/{{s*unsubscribe_url/` reads as "zero or more letters s" —
    // so the spaced form of the tag stopped matching and the guard refused
    // compliant campaigns. Lift the literal out of the source and try it.
    const literal = /const UNRESOLVED_OPT_OUT_TAG = \/(.+)\/;/.exec(SRC);
    expect(literal, 'the opt-out tag pattern is not where the guard reads it').not.toBeNull();
    expect(new RegExp(literal![1]!).test('{{ unsubscribe_url }}')).toBe(true);
    expect(new RegExp(literal![1]!).test('{{unsubscribe_url}}')).toBe(true);
  });

  it('the campaign render is told which stream it is, and which language', () => {
    // Without the stream the renderer would default every campaign to
    // marketing, which is safe but would put an opt-out on transactional
    // batches. Without the locale the footer it appends is always English.
    // Matched on the options object rather than the whole call, so renaming the
    // local that holds the schema does not read as the stream being dropped.
    // It did once: the schema now comes from readCampaignContent and is called
    // `parsed.schema`, and this assertion failed on the name while the
    // behaviour was unchanged.
    expect(SRC).toContain('renderBlocks(parsed.schema, { context: ctx, utm, stream, locale })');
    expect(SRC).toContain('renderPlainText(parsed.schema, { context: ctx, stream, locale })');
  });
});
