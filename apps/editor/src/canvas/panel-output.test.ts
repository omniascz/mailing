/**
 * What the new property panels can produce still parses.
 *
 * The panels are React and this package has no DOM, so the assertions run the
 * same pure functions the panels call, over factory blocks, and hand the
 * result to the real zod schema. "The component rendered" is
 * property-panel-coverage.test.tsx's job; this file is about the block that
 * comes out the other side.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It does not render the panels. If SocialEditor stops calling
 *    social-networks.ts and splices the array itself, this stays green.
 *  - It does not cover the plain text/colour inputs on video, coupon, code
 *    and product. Those are `z.string()` with no constraint, so there is no
 *    value a text box can hold that would fail — asserting it would be
 *    theatre. The fields that CAN fail are the ones tested here: the two
 *    list fields, the bounded number, and the optional number.
 *  - It says nothing about whether a field is wired to the right property.
 */
import { describe, it, expect } from 'vitest';
import {
  socialBlockSchema,
  shareBlockSchema,
  videoBlockSchema,
  codeBlockSchema,
  type ShareBlock,
  type SocialBlock,
  type VideoBlock,
} from '../schema/blocks.js';
import { createBlock } from '../schema/factory.js';
import {
  NEW_NETWORK_URL,
  SOCIAL_NETWORK_TYPES,
  addSocialNetwork,
  removeSocialNetwork,
  updateSocialNetwork,
} from './social-networks.js';
import {
  SHARE_NETWORKS,
  SHARE_NETWORK_LABEL,
  canRemoveShareNetwork,
  toggleShareNetwork,
} from './share-networks.js';
import { parseBoundedInt, parseOptionalPositiveInt } from './numeric-fields.js';

function block<T>(type: 'social' | 'share' | 'video'): T {
  return createBlock(type) as T;
}
const social = () => block<SocialBlock>('social');
const share = () => block<ShareBlock>('share');
const video = () => block<VideoBlock>('video');

// ---------------------------------------------------------------------------

describe('social panel output', () => {
  it('the network list the factory ships parses', () => {
    expect(socialBlockSchema.safeParse(social()).success).toBe(true);
  });

  it('the row "+ Add network" creates is a valid one', () => {
    // socialBlockSchema is the only place in the schema using .url(); a blank
    // starting address would make every add produce an unparseable block.
    const networks = addSocialNetwork([]);
    const parsed = socialBlockSchema.safeParse({ ...social(), networks });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(networks[0]?.url).toBe(NEW_NETWORK_URL);
  });

  it('adding to an empty list, then to a full one, both parse', () => {
    let networks = addSocialNetwork([]);
    for (let i = 0; i < 6; i++) networks = addSocialNetwork(networks);
    expect(networks).toHaveLength(7);
    expect(socialBlockSchema.safeParse({ ...social(), networks }).success).toBe(true);
  });

  it('an empty network list parses, because the schema sets no floor', () => {
    // Worth pinning: poll has 2..6 and share has min 1, so "there must be a
    // floor" is the natural assumption and it is wrong here. The panel says
    // so in words rather than blocking the removal.
    const parsed = socialBlockSchema.safeParse({ ...social(), networks: [] });
    expect(parsed.success).toBe(true);
  });

  it('removing every row one at a time never produces an invalid block', () => {
    let networks = social().networks;
    while (networks.length > 0) {
      networks = removeSocialNetwork(networks, 0);
      expect(socialBlockSchema.safeParse({ ...social(), networks }).success).toBe(true);
    }
  });

  it('every network type the select offers is accepted by the schema', () => {
    for (const type of SOCIAL_NETWORK_TYPES) {
      const networks = updateSocialNetwork(addSocialNetwork([]), 0, { type });
      expect(
        socialBlockSchema.safeParse({ ...social(), networks }).success,
        `${type} was rejected`,
      ).toBe(true);
    }
  });

  it('the select offers every type the schema accepts, and no more', () => {
    expect([...SOCIAL_NETWORK_TYPES].sort()).toEqual(
      ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube'].sort(),
    );
  });

  it('a typed-in address that is not a URL is rejected by the schema', () => {
    // Not something the panel prevents — it stores what is typed, like every
    // other URL field. Pinned so the behaviour is on the record: social is
    // the one block where a half-typed address will not save.
    const networks = updateSocialNetwork(addSocialNetwork([]), 0, { url: 'facebook.com' });
    expect(socialBlockSchema.safeParse({ ...social(), networks }).success).toBe(false);
  });

  it('out-of-range indices are no-ops rather than corruption', () => {
    const start = social().networks;
    expect(removeSocialNetwork(start, 99)).toEqual(start);
    expect(removeSocialNetwork(start, -1)).toEqual(start);
    expect(updateSocialNetwork(start, 99, { url: 'x' })).toEqual(start);
  });

  it('does not mutate its input', () => {
    const start = social().networks;
    const copy = JSON.parse(JSON.stringify(start));
    addSocialNetwork(start);
    removeSocialNetwork(start, 0);
    updateSocialNetwork(start, 0, { url: 'https://other.example' });
    expect(start).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------

describe('share panel output', () => {
  it('the factory block parses', () => {
    expect(shareBlockSchema.safeParse(share()).success).toBe(true);
  });

  it('every checkbox the panel offers is a network the schema accepts', () => {
    for (const network of SHARE_NETWORKS) {
      const parsed = shareBlockSchema.safeParse({ ...share(), networks: [network] });
      expect(parsed.success, `${network} was rejected`).toBe(true);
    }
  });

  it('every offered network has a label', () => {
    for (const network of SHARE_NETWORKS) {
      expect(SHARE_NETWORK_LABEL[network]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('unticking down to one is allowed and parses', () => {
    let networks: ShareBlock['networks'] = [...SHARE_NETWORKS];
    for (const n of SHARE_NETWORKS.slice(1)) networks = toggleShareNetwork(networks, n);
    expect(networks).toHaveLength(1);
    expect(shareBlockSchema.safeParse({ ...share(), networks }).success).toBe(true);
  });

  it('unticking the last one is refused, because .min(1) would reject it', () => {
    const one: ShareBlock['networks'] = ['email'];
    expect(canRemoveShareNetwork(one)).toBe(false);
    expect(toggleShareNetwork(one, 'email')).toEqual(one);
    expect(shareBlockSchema.safeParse({ ...share(), networks: [] }).success).toBe(false);
  });

  it('ticking one back on parses and does not duplicate', () => {
    const off = toggleShareNetwork(['email', 'facebook'], 'facebook');
    const on = toggleShareNetwork(off, 'facebook');
    expect(on).toEqual(['email', 'facebook']);
    expect(shareBlockSchema.safeParse({ ...share(), networks: on }).success).toBe(true);
  });

  it('toggling every network on, from one, parses at each step', () => {
    let networks: ShareBlock['networks'] = ['email'];
    for (const n of SHARE_NETWORKS.filter((x) => x !== 'email')) {
      networks = toggleShareNetwork(networks, n);
      expect(shareBlockSchema.safeParse({ ...share(), networks }).success).toBe(true);
    }
    expect(networks).toHaveLength(SHARE_NETWORKS.length);
  });

  it('does not mutate its input', () => {
    const start: ShareBlock['networks'] = ['email', 'facebook'];
    toggleShareNetwork(start, 'x');
    expect(start).toEqual(['email', 'facebook']);
  });
});

// ---------------------------------------------------------------------------

describe('video width, the field Number() would have broken', () => {
  const withWidth = (raw: string) => ({ ...video(), width: parseOptionalPositiveInt(raw) });

  it('a cleared field becomes undefined, not zero', () => {
    // Number('') === 0 and videoBlockSchema.width is .positive(), so the
    // naive handler turns an emptied box into a block that will not save.
    expect(parseOptionalPositiveInt('')).toBeUndefined();
    expect(videoBlockSchema.safeParse(withWidth('')).success).toBe(true);
    expect(videoBlockSchema.safeParse({ ...video(), width: 0 }).success).toBe(false);
  });

  it.each([['  '], ['abc'], ['-5'], ['0'], ['NaN']])('%s becomes undefined and parses', (raw) => {
    expect(parseOptionalPositiveInt(raw)).toBeUndefined();
    expect(videoBlockSchema.safeParse(withWidth(raw)).success).toBe(true);
  });

  it('a real number survives', () => {
    expect(parseOptionalPositiveInt('480')).toBe(480);
    expect(videoBlockSchema.safeParse(withWidth('480')).success).toBe(true);
  });

  it('a fraction is truncated, because .int() would reject it', () => {
    expect(parseOptionalPositiveInt('480.7')).toBe(480);
    expect(videoBlockSchema.safeParse(withWidth('480.7')).success).toBe(true);
    expect(videoBlockSchema.safeParse({ ...video(), width: 480.7 }).success).toBe(false);
  });
});

describe('social icon size, a bounded required number', () => {
  const withSize = (raw: string) => ({
    ...social(),
    iconSize: parseBoundedInt(raw, 16, 64, social().iconSize),
  });

  it('clamps below the floor and above the ceiling', () => {
    expect(parseBoundedInt('4', 16, 64, 32)).toBe(16);
    expect(parseBoundedInt('900', 16, 64, 32)).toBe(64);
    expect(socialBlockSchema.safeParse(withSize('4')).success).toBe(true);
    expect(socialBlockSchema.safeParse(withSize('900')).success).toBe(true);
  });

  it('the raw values the clamp exists to stop are rejected by the schema', () => {
    expect(socialBlockSchema.safeParse({ ...social(), iconSize: 4 }).success).toBe(false);
    expect(socialBlockSchema.safeParse({ ...social(), iconSize: 900 }).success).toBe(false);
  });

  it('keeps the previous value for blank or unusable input, never zero', () => {
    expect(parseBoundedInt('', 16, 64, 32)).toBe(32);
    expect(parseBoundedInt('abc', 16, 64, 32)).toBe(32);
    expect(socialBlockSchema.safeParse(withSize('')).success).toBe(true);
    expect(socialBlockSchema.safeParse({ ...social(), iconSize: 0 }).success).toBe(false);
  });

  it('passes a value already in range straight through', () => {
    expect(parseBoundedInt('40', 16, 64, 32)).toBe(40);
    expect(socialBlockSchema.safeParse(withSize('40')).success).toBe(true);
  });

  it('accepts both ends of the range', () => {
    expect(socialBlockSchema.safeParse(withSize('16')).success).toBe(true);
    expect(socialBlockSchema.safeParse(withSize('64')).success).toBe(true);
  });
});

describe('code panel bound', () => {
  it('the counter maximum is the schema maximum', () => {
    const at = 'a'.repeat(50_000);
    const over = 'a'.repeat(50_001);
    expect(codeBlockSchema.safeParse({ ...createBlock('code'), html: at }).success).toBe(true);
    expect(codeBlockSchema.safeParse({ ...createBlock('code'), html: over }).success).toBe(false);
  });

  it('an empty html field still parses, so clearing the box is not a trap', () => {
    expect(codeBlockSchema.safeParse({ ...createBlock('code'), html: '' }).success).toBe(true);
  });
});
