import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  findTemplate,
  listTemplates,
  type TemplateCategory,
} from './registry.js';

/**
 * Registry health checks — these run on every commit so a broken recipe
 * (orphan edge target, duplicate slug, missing trigger) fails fast in CI
 * before it lands in a gallery the user can fork.
 */
describe('WORKFLOW_TEMPLATES registry', () => {
  it('has at least 15 recipes spanning multiple categories', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    const cats = new Set<TemplateCategory>();
    WORKFLOW_TEMPLATES.forEach((t) => cats.add(t.category));
    expect(cats.size).toBeGreaterThanOrEqual(10);
  });

  it('slugs are unique', () => {
    const slugs = WORKFLOW_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every template has a trigger node + at least one send node', () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const triggers = t.nodes.filter((n) => n.type === 'trigger');
      expect(triggers.length, `${t.slug}: should have exactly 1 trigger node`).toBe(1);

      const sends = t.nodes.filter(
        (n) =>
          n.type.startsWith('send_') || n.type === 'show_in_app' || n.type === 'make_voice_call',
      );
      expect(sends.length, `${t.slug}: should have ≥1 send node`).toBeGreaterThanOrEqual(1);
    }
  });

  it('all edges reference existing node ids', () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const ids = new Set(t.nodes.map((n) => n.id));
      for (const edge of t.edges) {
        expect(
          ids.has(edge.source),
          `${t.slug}: edge ${edge.id} source ${edge.source} missing`,
        ).toBe(true);
        expect(
          ids.has(edge.target),
          `${t.slug}: edge ${edge.id} target ${edge.target} missing`,
        ).toBe(true);
      }
    }
  });

  it('edge ids are unique within a template', () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const ids = t.edges.map((e) => e.id);
      expect(new Set(ids).size, `${t.slug}: edge ids must be unique`).toBe(ids.length);
    }
  });

  it('CZ locale templates use Czech text (heuristic)', () => {
    const cz = WORKFLOW_TEMPLATES.filter((t) => t.locale === 'cs');
    expect(cz.length).toBeGreaterThanOrEqual(2);
    // crude check: at least one diacritic char somewhere in CZ recipes
    const hasDiacritic = cz.some((t) => /[áčďéěíňóřšťúůýž]/i.test(JSON.stringify(t)));
    expect(hasDiacritic).toBe(true);
  });
});

describe('findTemplate / listTemplates', () => {
  it('findTemplate returns null for missing slug', () => {
    expect(findTemplate('does-not-exist')).toBeNull();
  });

  it('findTemplate returns the welcome-3-step-en recipe', () => {
    const tpl = findTemplate('welcome-3-step-en');
    expect(tpl).not.toBeNull();
    expect(tpl!.category).toBe('welcome');
  });

  it('listTemplates filters by category', () => {
    const cart = listTemplates({ category: 'abandoned_cart' });
    expect(cart.length).toBeGreaterThanOrEqual(1);
    expect(cart.every((t) => t.category === 'abandoned_cart')).toBe(true);
  });

  it('listTemplates filters by locale', () => {
    const cs = listTemplates({ locale: 'cs' });
    expect(cs.every((t) => t.locale === 'cs')).toBe(true);
    expect(cs.length).toBeGreaterThan(0);
  });

  it('listTemplates filters by recommendedFor vertical', () => {
    const ecom = listTemplates({ recommendedFor: 'ecommerce' });
    expect(ecom.every((t) => t.recommendedFor.includes('ecommerce'))).toBe(true);
    expect(ecom.length).toBeGreaterThan(0);
  });
});
