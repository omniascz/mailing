/**
 * Integrations marketplace catalog (#6 CC-gap).
 *
 * A browsable directory of everything ForgeMsg connects to — native
 * integrations plus the Zapier bridge and the public OAuth2/REST API. Static
 * metadata (no DB); the connect flow for each lives in its own route.
 */

export type IntegrationCategory =
  | 'ecommerce'
  | 'crm'
  | 'social'
  | 'ads'
  | 'productivity'
  | 'payments'
  | 'shipping'
  | 'automation'
  | 'developer';

export type IntegrationAuth = 'oauth2' | 'api_key' | 'feed' | 'webhook' | 'built_in';

export interface IntegrationEntry {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  auth: IntegrationAuth;
  /** Route prefix a client uses to connect / manage this integration. */
  connectPath?: string;
  /** Regions where this integration is most relevant. */
  regions?: string[];
}

export const INTEGRATION_CATALOG: IntegrationEntry[] = [
  // ── E-commerce ──────────────────────────────────────────────────────────────
  { id: 'shopify', name: 'Shopify', category: 'ecommerce', description: 'Sync orders, products and customers; abandoned cart; coupon push.', auth: 'oauth2', connectPath: '/api/v1/ecommerce-integrations' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'ecommerce', description: 'WordPress store order + product sync and coupon generation.', auth: 'api_key', connectPath: '/api/v1/ecommerce-integrations' },
  { id: 'bigcommerce', name: 'BigCommerce', category: 'ecommerce', description: 'Order and catalog sync with webhook ingestion.', auth: 'oauth2', connectPath: '/api/v1/ecommerce-integrations' },
  { id: 'magento', name: 'Magento', category: 'ecommerce', description: 'Adobe Commerce order normalisation and product feeds.', auth: 'api_key', connectPath: '/api/v1/ecommerce-integrations' },
  { id: 'prestashop', name: 'PrestaShop', category: 'ecommerce', description: 'Order ingestion and product catalog sync.', auth: 'api_key', connectPath: '/api/v1/ecommerce-integrations' },
  { id: 'shoptet', name: 'Shoptet', category: 'ecommerce', description: 'CZ storefront: OAuth order sync, products and coupons.', auth: 'oauth2', connectPath: '/api/v1/ecommerce-integrations', regions: ['CZ', 'SK'] },
  { id: 'upgates', name: 'Upgates', category: 'ecommerce', description: 'CZ storefront order + product sync via API key.', auth: 'api_key', connectPath: '/api/v1/ecommerce-integrations', regions: ['CZ', 'SK'] },
  { id: 'fastcentrik', name: 'FastCentrik', category: 'ecommerce', description: 'CZ storefront product feed ingestion.', auth: 'feed', connectPath: '/api/v1/ecommerce-integrations', regions: ['CZ'] },

  // ── CRM ─────────────────────────────────────────────────────────────────────
  { id: 'salesforce', name: 'Salesforce', category: 'crm', description: 'Bi-directional contact and lead sync.', auth: 'oauth2', connectPath: '/api/v1/integrations/salesforce' },
  { id: 'hubspot', name: 'HubSpot', category: 'crm', description: 'Contact + company sync and lifecycle mapping.', auth: 'oauth2', connectPath: '/api/v1/integrations/hubspot' },
  { id: 'raynet', name: 'Raynet CRM', category: 'crm', description: 'CZ CRM two-way contact sync.', auth: 'api_key', connectPath: '/api/v1/integrations/raynet', regions: ['CZ', 'SK'] },

  // ── Social ──────────────────────────────────────────────────────────────────
  { id: 'facebook', name: 'Facebook Pages', category: 'social', description: 'Schedule and publish organic posts.', auth: 'oauth2', connectPath: '/api/v1/social/accounts' },
  { id: 'instagram', name: 'Instagram', category: 'social', description: 'Publish posts and manage the unified inbox.', auth: 'oauth2', connectPath: '/api/v1/social/accounts' },
  { id: 'linkedin', name: 'LinkedIn', category: 'social', description: 'Publish organic company-page posts.', auth: 'oauth2', connectPath: '/api/v1/social/accounts' },
  { id: 'tiktok', name: 'TikTok', category: 'social', description: 'Publish organic video posts.', auth: 'oauth2', connectPath: '/api/v1/social/accounts' },

  // ── Ads ─────────────────────────────────────────────────────────────────────
  { id: 'meta_ads', name: 'Meta Ads', category: 'ads', description: 'Sync hashed customer audiences and pull performance.', auth: 'oauth2', connectPath: '/api/v1/ads/accounts' },
  { id: 'google_ads', name: 'Google Ads', category: 'ads', description: 'Customer Match audience sync and reporting.', auth: 'oauth2', connectPath: '/api/v1/ads/accounts' },
  { id: 'sklik', name: 'Sklik', category: 'ads', description: 'CZ Seznam Sklik audience sync + lookalikes.', auth: 'oauth2', connectPath: '/api/v1/ads/accounts', regions: ['CZ'] },

  // ── Productivity ────────────────────────────────────────────────────────────
  { id: 'calendly', name: 'Calendly', category: 'productivity', description: 'Book meetings and trigger flows on scheduling.', auth: 'oauth2', connectPath: '/api/v1/integrations/calendly' },

  // ── Payments ────────────────────────────────────────────────────────────────
  { id: 'stripe', name: 'Stripe', category: 'payments', description: 'Billing, subscriptions and dunning retries.', auth: 'built_in' },
  { id: 'payments_cz', name: 'CZ Payments', category: 'payments', description: 'Czech payment gateways + SPAYD/QR invoicing.', auth: 'api_key', connectPath: '/api/v1/integrations/payments-cz', regions: ['CZ'] },

  // ── Shipping / marketplaces ──────────────────────────────────────────────────
  { id: 'packeta', name: 'Packeta', category: 'shipping', description: 'CZ/SK parcel shipping + tracking events.', auth: 'api_key', connectPath: '/api/v1/integrations/packeta', regions: ['CZ', 'SK'] },
  { id: 'allegro', name: 'Allegro', category: 'ecommerce', description: 'Marketplace order ingestion.', auth: 'oauth2', connectPath: '/api/v1/integrations/allegro', regions: ['PL', 'CZ'] },
  { id: 'mallcz', name: 'MALL', category: 'ecommerce', description: 'CZ marketplace order ingestion.', auth: 'api_key', connectPath: '/api/v1/integrations/mallcz', regions: ['CZ', 'SK'] },

  // ── Automation / developer ────────────────────────────────────────────────────
  { id: 'zapier', name: 'Zapier', category: 'automation', description: 'Connect 6000+ apps via triggers (new contact) and actions (create contact, add tag).', auth: 'api_key', connectPath: '/api/v1/zapier/me' },
  { id: 'rest_api', name: 'REST API', category: 'developer', description: 'Full REST API with OpenAPI docs and scoped API keys.', auth: 'api_key', connectPath: '/api/v1/settings/api-keys' },
  { id: 'oauth2_provider', name: 'OAuth2 Provider', category: 'developer', description: 'Register an app and use OAuth2 authorize/token/introspect.', auth: 'oauth2', connectPath: '/api/v1/oauth' },
  { id: 'webhooks', name: 'Webhooks', category: 'developer', description: 'Subscribe to events with HMAC-signed delivery + retries.', auth: 'webhook', connectPath: '/api/v1/webhooks' },
  { id: 'resend_compat', name: 'Resend-compatible API', category: 'developer', description: 'Drop-in Resend API for transactional email.', auth: 'api_key', connectPath: '/api/v1/emails' },
];

export function listIntegrationCatalog(category?: IntegrationCategory): IntegrationEntry[] {
  return category ? INTEGRATION_CATALOG.filter((i) => i.category === category) : INTEGRATION_CATALOG;
}

export function integrationCategories(): IntegrationCategory[] {
  return [...new Set(INTEGRATION_CATALOG.map((i) => i.category))];
}
