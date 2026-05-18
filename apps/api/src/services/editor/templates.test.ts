import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getAllCategories,
} from './templates/index.js';

describe('Template library', () => {
  it('has at least 10 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('every template has required fields', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.id, `${tpl.id} missing id`).toBeTruthy();
      expect(tpl.name, `${tpl.id} missing name`).toBeTruthy();
      expect(tpl.category, `${tpl.id} missing category`).toBeTruthy();
      expect(tpl.description, `${tpl.id} missing description`).toBeTruthy();
      expect(tpl.schema, `${tpl.id} missing schema`).toBeDefined();
    }
  });

  it('every template schema has a blocks array', () => {
    for (const tpl of TEMPLATES) {
      const schema = tpl.schema as { blocks?: unknown[] };
      expect(Array.isArray(schema.blocks), `${tpl.id} blocks should be array`).toBe(true);
      expect(schema.blocks!.length, `${tpl.id} should have at least 1 block`).toBeGreaterThan(0);
    }
  });

  it('every template schema has subject and globalStyles', () => {
    for (const tpl of TEMPLATES) {
      const schema = tpl.schema as { subject?: string; globalStyles?: object };
      expect(typeof schema.subject, `${tpl.id} subject should be string`).toBe('string');
      expect(typeof schema.globalStyles, `${tpl.id} globalStyles should be object`).toBe('object');
    }
  });

  it('no duplicate template ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('getTemplateById returns template for valid id', () => {
    const first = TEMPLATES[0]!;
    const found = getTemplateById(first.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(first.id);
  });

  it('getTemplateById returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent-id')).toBeUndefined();
  });

  it('getTemplatesByCategory filters correctly', () => {
    const newsletters = getTemplatesByCategory('newsletter');
    expect(newsletters.length).toBeGreaterThan(0);
    expect(newsletters.every((t) => t.category === 'newsletter')).toBe(true);
  });

  it('getAllCategories returns an array without duplicates', () => {
    const cats = getAllCategories();
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.length).toBe(new Set(cats).size);
  });

  it('covers the expected categories', () => {
    const cats = new Set(getAllCategories());
    const expected = ['newsletter', 'promo', 'transactional', 'event', 'onboarding', 'seasonal', 'ecommerce'];
    for (const cat of expected) {
      expect(cats.has(cat as never), `Missing category: ${cat}`).toBe(true);
    }
  });

  it('newsletter category has at least 2 templates', () => {
    expect(getTemplatesByCategory('newsletter').length).toBeGreaterThanOrEqual(2);
  });

  it('promo category has at least 2 templates', () => {
    expect(getTemplatesByCategory('promo').length).toBeGreaterThanOrEqual(2);
  });

  it('transactional category has at least 2 templates', () => {
    expect(getTemplatesByCategory('transactional').length).toBeGreaterThanOrEqual(2);
  });
});
