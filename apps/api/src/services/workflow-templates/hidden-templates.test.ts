import { describe, it, expect } from 'vitest';
import {
  HIDDEN_FLOW_TEMPLATES,
  HIDDEN_WORKFLOW_TEMPLATES,
  isHiddenFlowTemplate,
  isHiddenWorkflowTemplate,
} from './hidden-templates.js';
import { PUBLISHED_WORKFLOW_TEMPLATES, WORKFLOW_TEMPLATES, listTemplates } from './registry.js';
import { listCategories } from './index.js';
import { FLOW_TEMPLATES, PUBLISHED_FLOW_TEMPLATES } from '../workflows/flow-templates.js';

/**
 * The list of templates we do not offer, and the lists that must respect it.
 * The routes are covered against a real database in
 * integration/workflow-template-gallery.integration.test.ts.
 */

describe('the hidden list is about templates that exist', () => {
  it('every hidden slug is a template of this repo', () => {
    const slugs = new Set(WORKFLOW_TEMPLATES.map((t) => t.slug));
    const unknown = Object.keys(HIDDEN_WORKFLOW_TEMPLATES).filter((s) => !slugs.has(s));
    expect(unknown).toEqual([]);

    const ids = new Set(FLOW_TEMPLATES.map((t) => t.id));
    expect(Object.keys(HIDDEN_FLOW_TEMPLATES).filter((i) => !ids.has(i))).toEqual([]);
  });

  it('each one gives a reason a person can act on', () => {
    for (const [slug, reason] of Object.entries({
      ...HIDDEN_WORKFLOW_TEMPLATES,
      ...HIDDEN_FLOW_TEMPLATES,
    })) {
      // A sentence naming the step or the mismatch — not a marker like "TODO".
      expect(reason.length, `${slug} has no reason`).toBeGreaterThan(40);
      expect(reason.trim().endsWith('.'), `${slug}: the reason is not a sentence`).toBe(true);
      expect(reason, `${slug}: placeholder reason`).not.toMatch(/TODO|FIXME/);
    }
  });
});

describe('what is offered', () => {
  it('the gallery drops the hidden ones and keeps the rest', () => {
    // Not vacuous: measured when this was written, 87 templates, 63 hidden.
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThan(80);
    expect(Object.keys(HIDDEN_WORKFLOW_TEMPLATES).length).toBeGreaterThan(50);
    expect(PUBLISHED_WORKFLOW_TEMPLATES.length).toBe(
      WORKFLOW_TEMPLATES.length - Object.keys(HIDDEN_WORKFLOW_TEMPLATES).length,
    );
    expect(PUBLISHED_WORKFLOW_TEMPLATES.length, 'the gallery must not be empty').toBeGreaterThan(
      15,
    );
  });

  it('listTemplates offers the published ones and no hidden one, filters included', () => {
    const all = listTemplates();
    expect(all.length).toBe(PUBLISHED_WORKFLOW_TEMPLATES.length);
    expect(all.filter((t) => isHiddenWorkflowTemplate(t.slug))).toEqual([]);
    expect(all.map((t) => t.slug)).toContain('abandoned-cart-3-touch');
    expect(all.map((t) => t.slug)).not.toContain('ecom-post-refund-recovery');
    expect(all.map((t) => t.slug)).not.toContain('gdpr-account-deletion-confirm');

    const cart = listTemplates({ category: 'abandoned_cart' });
    expect(cart.length).toBeGreaterThan(0);
    expect(cart.filter((t) => isHiddenWorkflowTemplate(t.slug))).toEqual([]);
  });

  it('the category counts only count what can be forked', () => {
    const counts = listCategories();
    const total = counts.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(PUBLISHED_WORKFLOW_TEMPLATES.length);
    expect(counts.every((c) => c.count > 0)).toBe(true);
  });

  it('the pre-built flows do the same', () => {
    expect(PUBLISHED_FLOW_TEMPLATES.map((t) => t.id)).toEqual(
      FLOW_TEMPLATES.map((t) => t.id).filter((id) => !isHiddenFlowTemplate(id)),
    );
    expect(PUBLISHED_FLOW_TEMPLATES.length).toBeGreaterThan(0);
    expect(PUBLISHED_FLOW_TEMPLATES.map((t) => t.id)).not.toContain('dunning-payment-failed');
    expect(PUBLISHED_FLOW_TEMPLATES.map((t) => t.id)).toContain('abandoned-cart');
  });

  it('the Czech gallery is the two originals plus the six built on the Czech catalogue', () => {
    // #195 left two Czech templates, which was thin for a CZ/SK launch. The six
    // added since send Czech emails the catalogue already had; the ones still
    // hidden are waiting on emails nobody has written yet.
    const czech = PUBLISHED_WORKFLOW_TEMPLATES.filter((t) => t.locale === 'cs').map((t) => t.slug);
    expect(czech.sort()).toEqual(
      [
        'abandoned-cart-cs',
        'back-in-stock-cs',
        'cross-sell-cs',
        'cz-name-day-greeting',
        'loyalty-points-cs',
        'payment-pending-cs',
        'pickup-invoice-cs',
        'post-purchase-cs',
      ].sort(),
    );
  });
});
