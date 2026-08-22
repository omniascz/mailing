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

  /**
   * This used to assert that thumbnailUrl was truthy and began with
   * data:image/svg+xml. Both were guaranteed by the generator that runs a few
   * lines above it, so the test could not fail — and it stayed green while all
   * 71 tiles were the same card in a different hue.
   *
   * It now asserts the part that was untrue: the thumbnail is drawn from the
   * template, so templates that differ get tiles that differ.
   */
  it('draws every thumbnail from the template it depicts', () => {
    const byUrl = new Map<string, string[]>();
    for (const t of TEMPLATES) {
      expect(t.thumbnailUrl, `${t.id} missing thumbnail`).toBeTruthy();
      expect(t.thumbnailUrl!.startsWith('data:image/svg+xml')).toBe(true);
      byUrl.set(t.thumbnailUrl!, [...(byUrl.get(t.thumbnailUrl!) ?? []), t.id]);
    }

    // Two templates with the same block sequence legitimately produce the same
    // wireframe, so the bar is not "all distinct" — but it is nowhere near
    // one-tile-for-everything, which is what it was.
    expect(
      byUrl.size,
      `only ${byUrl.size} distinct thumbnails for ${TEMPLATES.length} templates`,
    ).toBeGreaterThan(TEMPLATES.length / 2);
  });

  it('does not give a hero template and a plain-text template the same tile', () => {
    const hasHero = (t: (typeof TEMPLATES)[number]) =>
      ((t.schema as { blocks?: Array<{ type?: string }> }).blocks ?? []).some(
        (b) => b.type === 'hero',
      );
    const withHero = TEMPLATES.find(hasHero)!;
    const withoutHero = TEMPLATES.find((t) => !hasHero(t))!;
    expect(withHero.thumbnailUrl).not.toBe(withoutHero.thumbnailUrl);
  });

  it('carries the hero colour the template actually uses', () => {
    // Fails the moment the generator goes back to taking a name and a category
    // instead of the schema.
    const t = TEMPLATES.find((x) => x.id === 'cs-black-friday')!;
    expect(decodeURIComponent(t.thumbnailUrl!)).toContain('#111827');
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
