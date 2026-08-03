import { describe, it, expect } from 'vitest';
import { buildMimePartOrder, renderAmp, validateAmp } from './amp-renderer.js';

const VALID_AMP = `<!doctype html>
<html ⚡4email>
  <head>
    <meta charset="utf-8">
    <script async src="https://cdn.ampproject.org/v0.js"></script>
    <style amp4email-boilerplate>body{visibility:hidden}</style>
  </head>
  <body>
    <p>Hello AMP world.</p>
  </body>
</html>`;

describe('validateAmp', () => {
  it('accepts the canonical AMP4EMAIL skeleton', () => {
    const r = validateAmp(VALID_AMP);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts the long-form amp4email attribute', () => {
    const longForm = VALID_AMP.replace('<html ⚡4email>', '<html amp4email>');
    const r = validateAmp(longForm);
    expect(r.valid).toBe(true);
  });

  it('rejects missing doctype', () => {
    const r = validateAmp(VALID_AMP.replace('<!doctype html>', '').trim());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('missing_doctype');
  });

  it('rejects missing AMP4EMAIL attribute', () => {
    const r = validateAmp(VALID_AMP.replace('<html ⚡4email>', '<html>'));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('missing_amp4email_attribute');
  });

  it('rejects missing AMP runtime script', () => {
    const r = validateAmp(
      VALID_AMP.replace('<script async src="https://cdn.ampproject.org/v0.js"></script>', ''),
    );
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('missing_amp_runtime');
  });

  it('rejects raw <script> tags', () => {
    const r = validateAmp(
      VALID_AMP.replace('<p>Hello AMP world.</p>', '<p>Hi</p><script>alert(1)</script>'),
    );
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('forbidden_tag_script');
  });

  it('rejects iframes', () => {
    const r = validateAmp(VALID_AMP.replace('<p>Hello AMP world.</p>', '<iframe></iframe>'));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('forbidden_tag_iframe');
  });

  it('does not flag amp-script (whitelist via prefix boundary)', () => {
    const ampScript = VALID_AMP.replace(
      '<p>Hello AMP world.</p>',
      '<amp-script src="https://e.com/x.js" layout="container"><p>x</p></amp-script>',
    );
    const r = validateAmp(ampScript);
    expect(r.errors).not.toContain('forbidden_tag_script');
  });

  it('warns (not errors) for <meta> inside <body>', () => {
    // The validator scans the body for forbidden tags; meta/link are
    // warnings rather than hard errors because they have legitimate
    // (rare) uses in AMP4EMAIL extensions.
    const withMetaInBody = VALID_AMP.replace(
      '<p>Hello AMP world.</p>',
      '<meta name="x" content="y"><p>x</p>',
    );
    const r = validateAmp(withMetaInBody);
    expect(r.errors).not.toContain('forbidden_tag_meta');
    expect(r.warnings).toContain('uses_meta_tag');
  });

  it('rejects an empty body', () => {
    const r = validateAmp('');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('empty_amp_body');
  });

  it('rejects bodies over the 75KB Gmail cap', () => {
    const big = VALID_AMP.replace('Hello AMP world.', 'x'.repeat(80_000));
    const r = validateAmp(big);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/amp_body_over/);
  });
});

describe('renderAmp', () => {
  it('returns trimmed body on success', () => {
    const r = renderAmp(`\n\n${VALID_AMP}\n`);
    expect(r.amp.startsWith('<!doctype html>')).toBe(true);
    expect(r.report.valid).toBe(true);
  });

  it('drops the body when invalid', () => {
    const r = renderAmp('<html>not amp</html>');
    expect(r.amp).toBe('');
    expect(r.report.valid).toBe(false);
  });
});

describe('buildMimePartOrder', () => {
  it('returns null for absent parts', () => {
    expect(buildMimePartOrder({})).toEqual({ text: null, amp: null, html: null });
  });

  it('preserves the three parts in the proper structure', () => {
    const out = buildMimePartOrder({
      text: 'hi',
      amp: '  <!doctype html><html ⚡4email>...</html>  ',
      html: '<p>hi</p>',
    });
    expect(out.text).toBe('hi');
    expect(out.amp?.startsWith('<!doctype')).toBe(true);
    expect(out.html).toBe('<p>hi</p>');
  });
});
