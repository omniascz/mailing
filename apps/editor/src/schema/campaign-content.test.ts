import { describe, it, expect } from 'vitest';
import { readCampaignContent } from './campaign-content.js';
import type { EmailSchema } from './blocks.js';

/**
 * The shape the visual editor writes has to be recognised as blocks.
 *
 * `apps/web/src/app/editor/campaigns/[id]/visual-editor-shell.tsx` saves
 *
 *     content: { schema, html }
 *
 * and both consumers used to ask `'blocks' in content`, which is false for it.
 * So the product's primary editor produced campaigns that took the raw-HTML
 * branch: no compliance footer from the renderer, no sanitisation, no UTM, no
 * protected-URL identity — and the body they shipped was the `html` the
 * BROWSER had rendered at save time, against a hard-coded preview contact.
 */

const GS = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

const block = (text: string) => ({
  id: 'b1',
  type: 'text' as const,
  content: text,
  fontSize: '15px',
  fontFamily: GS.fontFamily,
  color: '#374151',
  lineHeight: '1.6',
  textAlign: 'left' as const,
});

const schemaOf = (text: string) => ({
  subject: 'Ahoj',
  preheader: '',
  globalStyles: GS,
  blocks: [block(text)],
});

describe('readCampaignContent', () => {
  it('recognises the flat EmailSchema the tests and templates use', () => {
    const got = readCampaignContent(schemaOf('Dobrý den.'));
    expect(got.shape).toBe('blocks');
    expect(got.schema?.blocks).toHaveLength(1);
  });

  it('recognises the { schema, html } the visual editor actually writes', () => {
    // The exact body of the PUT in visual-editor-shell.tsx.
    const got = readCampaignContent({
      schema: schemaOf('Dobrý den.'),
      html: '<html><body>pre-rendered by the browser</body></html>',
    });

    expect(
      got.shape,
      'this is the product’s main authoring path — reading it as raw HTML is the bug',
    ).toBe('schema');
    expect(got.schema?.blocks).toHaveLength(1);
  });

  it('does not mistake the editor’s pre-rendered html for the content', () => {
    // The stored `html` is a snapshot the browser made against a fake contact.
    // Reading it instead of the schema is what shipped "Ada Nováková" to
    // everybody; the schema still holds the merge tag.
    const got = readCampaignContent({
      schema: schemaOf('Dobrý den, {{contact.first_name}}.'),
      html: '<p>Dobrý den, Ada.</p>',
    });
    const rendered = JSON.stringify(got.schema);
    expect(rendered).toContain('{{contact.first_name}}');
    expect(rendered).not.toContain('Ada');
  });

  it('reports raw HTML as raw HTML rather than pretending it is a schema', () => {
    const got = readCampaignContent({ html: '<!doctype html><html><body>Hi</body></html>' });
    expect(got.shape).toBe('raw-html');
    expect(got.schema).toBeNull();
  });

  it('reports the RSS draft shape as unknown, not as raw HTML', () => {
    // services/rss/index.ts writes this. It is neither, and calling it raw HTML
    // would make the send path emit JSON.stringify of it as the body.
    const got = readCampaignContent({ items: [], sourceFeed: 'x', generatedFrom: 'rss' });
    expect(got.shape).toBe('unknown');
    expect(got.schema).toBeNull();
  });

  it('says WHY a schema-shaped content produced no schema', () => {
    // A block type removed or a field renamed. Silently falling through to the
    // raw-HTML branch is how that stopped being visible.
    const got = readCampaignContent({ schema: { blocks: [{ type: 'nonsense' }] } });
    expect(got.shape).toBe('schema');
    expect(got.schema).toBeNull();
    expect(got.error, 'a parse failure has to be reportable').toBeTruthy();
  });

  it('threads the campaign row’s preheader onto the schema', () => {
    // preheader lives on the campaign row, not inside content.
    const got = readCampaignContent({ schema: schemaOf('x') }, 'Rychlý úvod');
    expect(got.schema?.preheader).toBe('Rychlý úvod');
  });

  it('lets content keep its own preheader over the row’s', () => {
    const withOwn = { ...schemaOf('x'), preheader: 'z obsahu' };
    expect(readCampaignContent({ schema: withOwn }, 'z řádku').schema?.preheader).toBe('z obsahu');
  });

  it('handles null and rubbish without throwing', () => {
    for (const input of [null, undefined, {}, { html: '' }] as const) {
      const got = readCampaignContent(input as Record<string, unknown> | null | undefined);
      expect(got.schema).toBeNull();
      expect(['unknown', 'raw-html']).toContain(got.shape);
    }
  });
});

describe('the schema it returns is the renderer’s own type', () => {
  it('type-checks as EmailSchema', () => {
    const got = readCampaignContent(schemaOf('x'));
    const s: EmailSchema | null = got.schema;
    expect(s?.globalStyles.contentWidth).toBe(600);
  });
});
