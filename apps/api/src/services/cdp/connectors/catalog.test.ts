import { describe, it, expect } from 'vitest';
import {
  CONNECTOR_CATALOG,
  listConnectors,
  isConnectorAvailable,
  type ConnectorKind,
} from './index.js';

describe('CDP connector catalog', () => {
  it('has an entry for every declared connector kind', () => {
    // Every catalog value's kind must match its key (no typos / drift).
    for (const [key, info] of Object.entries(CONNECTOR_CATALOG)) {
      expect(info.kind).toBe(key);
    }
  });

  it('listConnectors returns all catalog entries', () => {
    expect(listConnectors()).toHaveLength(Object.keys(CONNECTOR_CATALOG).length);
  });

  it('marks the three built pull connectors as implemented', () => {
    for (const kind of ['hubspot', 'shopify', 'stripe'] as ConnectorKind[]) {
      expect(CONNECTOR_CATALOG[kind].status).toBe('implemented');
      expect(isConnectorAvailable(kind)).toBe(true);
    }
  });

  it('treats push sources (webhook/http_pull) as available', () => {
    expect(isConnectorAvailable('webhook')).toBe(true);
    expect(isConnectorAvailable('http_pull')).toBe(true);
  });

  it('rejects planned connectors as unavailable', () => {
    for (const kind of ['salesforce', 'woocommerce', 'segment', 'mixpanel'] as ConnectorKind[]) {
      expect(CONNECTOR_CATALOG[kind].status).toBe('planned');
      expect(isConnectorAvailable(kind)).toBe(false);
    }
  });

  it('rejects unknown kinds', () => {
    expect(isConnectorAvailable('not_a_real_connector')).toBe(false);
  });
});
