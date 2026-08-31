/**
 * The public site does not advertise things the product does not do.
 *
 * The pricing page carried a line item — "HLR lookup: 0,40 Kč / dotaz" — for a
 * feature that was cancelled: `apps/number-intel` is gone, there is no route,
 * no service and no provider credential anywhere in the repo, and
 * `/api/v1/number-intel/*` answers 404 even with FEATURE_BEYOND_CORE on
 * (measured). The landing page listed it as an SMS capability. A price for
 * something that cannot be bought is the worst version of this defect, so it
 * gets a guard rather than a one-off deletion.
 *
 * Asserted against the page sources rather than a rendered DOM: this suite runs
 * in a node environment with no renderer, and the claim lives in the source
 * either way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_PAGES = ['landing/page.tsx', 'pricing/page.tsx'] as const;

const read = (rel: string) => readFileSync(join(__dirname, '../app/(public)', rel), 'utf8');

describe('cancelled features are not advertised', () => {
  it.each(PUBLIC_PAGES)('%s does not mention HLR', (page) => {
    expect(read(page)).not.toMatch(/\bHLR\b/i);
  });

  it.each(PUBLIC_PAGES)('%s does not mention number-intel', (page) => {
    expect(read(page)).not.toMatch(/number[\s-]?intel/i);
  });
});

describe('claims match what the channel can actually do', () => {
  /**
   * Voice works as an API-initiated call — `POST /api/v1/voice/calls/initiate`
   * reaches Twilio's REST API for real. What it is not is a campaign channel:
   * `dispatchChannelCampaign` throws for any type but sms/whatsapp/push, and
   * the `voice-call` queue has no consumer anywhere in the repo. The landing
   * page used to promise it "jako kanál v kampani".
   */
  it('the landing page does not offer voice as a campaign channel', () => {
    expect(read('landing/page.tsx')).not.toMatch(/kan[áa]l v kampani/i);
  });

  it('but it still offers voice, which does work', () => {
    expect(read('landing/page.tsx')).toMatch(/Voice agent/);
  });
});

/**
 * Everything registered through `registerBeyondCore` in apps/api/src/index.ts is
 * absent — not 404, absent — whenever FEATURE_BEYOND_CORE is off, which is what
 * the shipped images do (apps/web/Dockerfile now says so explicitly). The public
 * site is read by people who have not signed up yet and cannot see a feature
 * flag, so it may only promise what a default deployment actually serves.
 */
describe('the landing page does not sell what is behind FEATURE_BEYOND_CORE', () => {
  /**
   * `aiAgentRoutes` is beyond-core, so /ai-agents has no endpoints in a default
   * deployment. The per-plan AI quotas on the pricing page are a different
   * thing and stay: those are core and are not asserted against here.
   */
  it('does not advertise AI agents', () => {
    expect(read('landing/page.tsx')).not.toMatch(/AI\s+agent/i);
  });

  /**
   * Shoptet's OAuth install/callback and the whole ecommerce connections CRUD
   * live in `ecommerceRoutes`, which is beyond-core — so a default deployment
   * cannot connect a Shoptet store at all, and an import from one cannot start.
   * CSV import is core (`contactImportRoutes`) and is what the page offers now.
   */
  it('does not offer importing contacts from Shoptet', () => {
    expect(read('landing/page.tsx')).not.toMatch(/shoptet/i);
  });
});

describe('the data-residency answer describes what registration really does', () => {
  /**
   * There is no region picker. `POST /api/v1/auth/register` derives the region
   * from the signup country — `suggestRegionForCountry`, EU list → 'eu', APAC →
   * 'ap', everything else → 'us' — and the comment there says it is never moved
   * automatically afterwards. The page used to say "při registraci si vyberete
   * data region", which describes a control that does not exist.
   */
  it('does not claim the customer picks a region', () => {
    expect(read('pricing/page.tsx')).not.toMatch(/vyberete\s+data\s+region/i);
  });

  it('says the region is derived instead', () => {
    expect(read('pricing/page.tsx')).toMatch(/odvod[íi]me ho ze zem[ěe]/i);
  });
});
