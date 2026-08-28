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

const read = (rel: string) =>
  readFileSync(join(__dirname, '../app/(public)', rel), 'utf8');

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
