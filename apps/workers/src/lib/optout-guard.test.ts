import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOptOutPresent, UNRESOLVED_OPT_OUT_TAG } from './optout-guard.js';

/**
 * The send-path safety net, and why it exists alongside the renderer.
 *
 * The renderer is the barrier for block templates: it appends a compliance
 * footer when the template has none, so no template — existing or future — can
 * produce marketing HTML without an opt-out. It cannot reach a campaign stored
 * as raw `{ html }` (batch-sender path 2: parseMergeTags on the stored string,
 * straight to the wire), nor content it did not recognise at all (path 3).
 * So the check sits in the sending path.
 *
 * ─── Two kinds of test in this file, and what each is worth ─────────────────
 *
 * 1. BEHAVIOUR. The guard is called and its outcome observed. This is the part
 *    that can say the guard refuses. It became possible when the function moved
 *    out of batch-sender.ts (which opens Redis connections on import) into
 *    ./optout-guard.ts.
 *
 * 2. SCAN. Assertions on the SOURCE of batch-sender.ts, for the one thing a
 *    behavioural test cannot reach: that the call site is still there, on every
 *    rendered message, before the send.
 *
 * ─── What the scan half CANNOT see ──────────────────────────────────────────
 *
 *   - Whether the call is reached at runtime. A `return` above it, a `try`
 *     that swallows the throw, or a branch that skips the whole render would
 *     all leave the text intact. Only the integration suites walk that.
 *   - Whether `rendered`, `stream` and `unsubscribeUrl` hold what their names
 *     say at that point.
 *   - Anything in the guard's own logic: that is what the behaviour half is
 *     for, and the scan deliberately no longer asserts on the guard body.
 *   - Code reached through a different call path — a second sender, a retry
 *     wrapper, a future queue — that never mentions the guard at all.
 *   - A call commented out with a leading `//`: the substring match would
 *     still find it. The self-tests below pin what the matcher discriminates,
 *     not that it is sufficient.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SENDER_SRC = readFileSync(join(HERE, '..', 'jobs', 'batch-sender.ts'), 'utf8');

const marketing = 'broadcast' as const;
const UNSUB = 'https://track.example/unsubscribe/abc123';

const body = (html: string, text: string, shape: 'raw-html' | 'blocks' | 'schema' | 'unknown') => ({
  html,
  text,
  shape,
});

describe('BEHAVIOUR: marketing mail with no opt-out is refused', () => {
  it('refuses a body that has neither the URL nor the tag', () => {
    expect(() =>
      assertOptOutPresent(body('<p>Akce</p>', 'Akce', 'raw-html'), marketing, UNSUB, 'c1'),
    ).toThrow(/no unsubscribe link/);
  });

  it('refuses the JSON a fallback render produces', () => {
    // The RSS shape, before api/services/rss built a block schema instead:
    // readCampaignContent said 'unknown', the send path stringified the feed.
    const json = JSON.stringify({ items: [{ title: 'Sleva' }], generatedFrom: 'rss' });
    expect(() => assertOptOutPresent(body(json, json, 'unknown'), marketing, UNSUB, 'c2')).toThrow(
      /no unsubscribe link/,
    );
  });

  it('lets through a body carrying the resolved URL', () => {
    expect(() =>
      assertOptOutPresent(
        body(`<a href="${UNSUB}">Odhlásit</a>`, `Odhlásit: ${UNSUB}`, 'raw-html'),
        marketing,
        UNSUB,
        'c3',
      ),
    ).not.toThrow();
  });

  it('lets through the unresolved merge tag, spaced or not', () => {
    expect(() =>
      assertOptOutPresent(
        body('<a href="{{unsubscribe_url}}">x</a>', '{{ unsubscribe_url }}', 'raw-html'),
        marketing,
        UNSUB,
        'c4',
      ),
    ).not.toThrow();
  });

  it('refuses when only the HTML half has the link', () => {
    // A text alternative with no way out is the same violation, in the half a
    // filter reads when it scores the mail.
    expect(() =>
      assertOptOutPresent(
        body(`<a href="${UNSUB}">Odhlásit</a>`, 'Akce tohoto týdne', 'raw-html'),
        marketing,
        UNSUB,
        'c5',
      ),
    ).toThrow(/rendered text has no unsubscribe link/);
  });

  it('refuses when only the text half has the link', () => {
    expect(() =>
      assertOptOutPresent(
        body('<p>Akce</p>', `Odhlásit: ${UNSUB}`, 'raw-html'),
        marketing,
        UNSUB,
        'c6',
      ),
    ).toThrow(/rendered html has no unsubscribe link/);
  });

  it('names both halves when both are missing', () => {
    expect(() => assertOptOutPresent(body('a', 'b', 'raw-html'), marketing, UNSUB, 'c7')).toThrow(
      /rendered html and text has no unsubscribe link/,
    );
  });

  it('lets transactional mail through untouched', () => {
    expect(() =>
      assertOptOutPresent(
        body('<p>Účtenka</p>', 'Účtenka', 'raw-html'),
        'transactional',
        UNSUB,
        'c8',
      ),
    ).not.toThrow();
  });

  it('throws rather than reporting a skipped contact', () => {
    // Skipping would send the campaign to everyone whose render happened to
    // contain a link and silently drop the rest — the same violation, quieter.
    let threw = false;
    let returned: unknown = 'not-called';
    try {
      returned = assertOptOutPresent(body('a', 'b', 'raw-html'), marketing, UNSUB, 'c9');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(returned).toBe('not-called');
  });
});

describe('BEHAVIOUR: the refusal says something true about the campaign', () => {
  it('does not call an RSS-style fallback a raw-HTML campaign', () => {
    // The message used to be one sentence for every shape: "this is a raw-HTML
    // campaign, so the link has to be in the content — add {{unsubscribe_url}}".
    // For generated content that is advice nobody can follow.
    let message = '';
    try {
      assertOptOutPresent(body('{"items":[]}', '{"items":[]}', 'unknown'), marketing, UNSUB, 'c10');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain('raw-HTML campaign');
    expect(message).not.toContain('add {{unsubscribe_url}}');
    expect(message).toContain('did not recognise');
  });

  it('still tells a raw-HTML campaign to put the tag in its content', () => {
    let message = '';
    try {
      assertOptOutPresent(body('<p>x</p>', 'x', 'raw-html'), marketing, UNSUB, 'c11');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('stored as raw HTML');
    expect(message).toContain('{{unsubscribe_url}}');
  });

  it('tells a block campaign that the schema, not the body, is the problem', () => {
    // Reaching the guard with shape 'schema' means the schema failed to parse
    // and the render fell back — the footer never had a chance to be appended.
    let message = '';
    try {
      assertOptOutPresent(body('<p>x</p>', 'x', 'schema'), marketing, UNSUB, 'c12');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('did not parse');
  });
});

describe('BEHAVIOUR: the tag pattern keeps its escapes', () => {
  it('matches every form the tag parser accepts', () => {
    // An earlier inline version had lost them — `/{{s*unsubscribe_url/` reads
    // as "zero or more letters s" — so the spaced form stopped matching and the
    // guard refused campaigns that were in fact compliant.
    expect(UNRESOLVED_OPT_OUT_TAG.test('{{unsubscribe_url}}')).toBe(true);
    expect(UNRESOLVED_OPT_OUT_TAG.test('{{ unsubscribe_url }}')).toBe(true);
    expect(UNRESOLVED_OPT_OUT_TAG.test('{{\tunsubscribe_url}}')).toBe(true);
  });

  it('does not match the things a broken escape would have matched', () => {
    expect(UNRESOLVED_OPT_OUT_TAG.test('unsubscribe_url')).toBe(false);
    expect(UNRESOLVED_OPT_OUT_TAG.test('{unsubscribe_url}')).toBe(false);
    expect(UNRESOLVED_OPT_OUT_TAG.test('xssunsubscribe_url')).toBe(false);
  });
});

describe('SCAN: the guard is still on the send path', () => {
  /** The one thing asserted about the source. Kept next to its self-tests. */
  const callSite = (src: string): boolean =>
    src.includes('assertOptOutPresent(rendered, stream, unsubscribeUrl');

  it('SELF-TEST: the matcher fires on a positive control', () => {
    // Without this, a renamed argument would turn the assertion below into a
    // test that can only pass by accident — which is how five scan tests in
    // this repo went quietly green.
    expect(
      callSite('  assertOptOutPresent(rendered, stream, unsubscribeUrl, data.campaignId);'),
    ).toBe(true);
  });

  it('SELF-TEST: the matcher does not fire on near misses', () => {
    expect(callSite('function assertOptOutPresent(')).toBe(false);
    expect(callSite('assertOptOutPresent(rendered, unsubscribeUrl, stream)')).toBe(false);
    expect(callSite('// assertOptOutPresent was here')).toBe(false);
    expect(callSite('')).toBe(false);
  });

  it('SELF-TEST: the file it reads is the sender, and it is not empty', () => {
    // A readFileSync on the wrong path throws, but a path that resolves to a
    // stub or a moved file would not. Pin something only batch-sender has.
    expect(SENDER_SRC.length).toBeGreaterThan(1000);
    expect(SENDER_SRC).toContain('export async function processBatchSender');
  });

  it('the call is in batch-sender.ts, on every rendered message', () => {
    expect(callSite(SENDER_SRC)).toBe(true);
  });

  it('the guard is imported rather than redefined locally', () => {
    // Two copies of this rule would be two rules. The behaviour tests above
    // only cover the one in ./optout-guard.ts.
    expect(SENDER_SRC).toContain("import { assertOptOutPresent } from '../lib/optout-guard.js'");
    expect(SENDER_SRC).not.toContain('function assertOptOutPresent(');
  });

  it('the campaign render is told which stream it is, and which language', () => {
    // Without the stream the renderer would default every campaign to
    // marketing, which is safe but would put an opt-out on transactional
    // batches. Without the locale the footer it appends is always English.
    expect(SENDER_SRC).toContain(
      'renderBlocks(parsed.schema, { context: ctx, utm, stream, locale })',
    );
    expect(SENDER_SRC).toContain(
      'renderPlainText(parsed.schema, { context: ctx, stream, locale })',
    );
  });
});
