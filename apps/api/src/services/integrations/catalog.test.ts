import { describe, it, expect } from 'vitest';
import {
  INTEGRATION_CATALOG,
  listIntegrationCatalog,
  integrationCategories,
} from './catalog.js';

describe('integration catalog', () => {
  it('has unique ids', () => {
    const ids = INTEGRATION_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the major categories', () => {
    const cats = integrationCategories();
    for (const c of ['ecommerce', 'crm', 'social', 'ads', 'developer', 'automation']) {
      expect(cats).toContain(c);
    }
  });

  it('filters by category', () => {
    const ecom = listIntegrationCatalog('ecommerce');
    expect(ecom.length).toBeGreaterThan(3);
    expect(ecom.every((i) => i.category === 'ecommerce')).toBe(true);
  });

  it('includes the Zapier bridge and REST API', () => {
    const ids = INTEGRATION_CATALOG.map((i) => i.id);
    expect(ids).toContain('zapier');
    expect(ids).toContain('rest_api');
  });
});
