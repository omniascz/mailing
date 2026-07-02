import { describe, it, expect } from 'vitest';
import { renderEmail } from '@forgemsg/editor/render';
import type { EmailSchema } from '@forgemsg/editor/schema';
import { TEMPLATES, getTemplatesByCategory, getAllCategories } from './index.js';
import { EXTENDED_TEMPLATES_2 } from './extended2.js';

describe('template library', () => {
  it('has a substantial number of templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(70);
  });

  it('has unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every template a thumbnail', () => {
    for (const t of TEMPLATES) {
      expect(t.thumbnailUrl, `${t.id} missing thumbnail`).toBeTruthy();
      expect(t.thumbnailUrl!.startsWith('data:image/svg+xml')).toBe(true);
    }
  });

  it('covers all categories', () => {
    const cats = getAllCategories();
    expect(cats.length).toBeGreaterThanOrEqual(8);
    for (const c of cats) {
      expect(getTemplatesByCategory(c).length).toBeGreaterThan(0);
    }
  });

  it('every batch-2 template renders to HTML (merge-tag URLs tolerated)', () => {
    // Templates are stored loosely (button URLs are merge tags like
    // {{cta_url}} which don't pass .url() validation) — the render path is
    // tolerant, so we verify renderability rather than strict schema parse.
    for (const t of EXTENDED_TEMPLATES_2) {
      const { html } = renderEmail(t.schema as unknown as EmailSchema);
      expect(html, `${t.id} did not render`).toContain('<!DOCTYPE html');
      expect(html).toContain('</html>');
    }
  });
});
