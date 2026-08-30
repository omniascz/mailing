/**
 * What the poll property panel can produce is a valid poll block.
 *
 * The assertions run the same functions PollEditor calls, over a block from
 * the same factory the canvas uses, and hand the result to the real
 * `pollBlockSchema`. So this is not "the component rendered" — it is "the
 * edits a user can perform still parse".
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It does not render PollEditor. If PollEditor stops calling these
 *    functions and splices the array itself, this file stays green while the
 *    panel breaks. The narrow defence is that PollEditor has no other way to
 *    reach the limits, and it imports nothing else that could.
 *  - It does not prove the Add/Remove buttons are disabled at the limits,
 *    only that pressing them anyway cannot corrupt the block.
 *  - It says nothing about the vote URLs. Those do not live in the block:
 *    they are built per recipient at render time, which is why an answer is
 *    a bare string here and not { text, url }.
 */
import { describe, it, expect } from 'vitest';
import { pollBlockSchema, type PollBlock } from '../schema/blocks.js';
import { createBlock } from '../schema/factory.js';
import {
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
  addPollOption,
  removePollOption,
  setPollOption,
  canAddPollOption,
  canRemovePollOption,
} from './poll-options.js';

function newPoll(): PollBlock {
  const block = createBlock('poll');
  if (block.type !== 'poll') throw new Error('factory did not return a poll block');
  return block;
}

/** Apply an options patch the way the store's `updateBlock` reducer does. */
function withOptions(block: PollBlock, options: string[]): unknown {
  return { ...block, options };
}

describe('the limits this file duplicates match the schema', () => {
  // poll-options.ts hardcodes 2 and 6. These four parses are the only reason
  // that is allowed: they read the limits off the schema itself, so the copy
  // cannot drift without going red.
  const base = newPoll();
  const listOf = (n: number) => Array.from({ length: n }, (_, i) => `Answer ${i + 1}`);

  it(`rejects ${POLL_MIN_OPTIONS - 1} answers`, () => {
    expect(pollBlockSchema.safeParse(withOptions(base, listOf(POLL_MIN_OPTIONS - 1))).success).toBe(
      false,
    );
  });

  it(`accepts ${POLL_MIN_OPTIONS} answers`, () => {
    expect(pollBlockSchema.safeParse(withOptions(base, listOf(POLL_MIN_OPTIONS))).success).toBe(
      true,
    );
  });

  it(`accepts ${POLL_MAX_OPTIONS} answers`, () => {
    expect(pollBlockSchema.safeParse(withOptions(base, listOf(POLL_MAX_OPTIONS))).success).toBe(
      true,
    );
  });

  it(`rejects ${POLL_MAX_OPTIONS + 1} answers`, () => {
    expect(pollBlockSchema.safeParse(withOptions(base, listOf(POLL_MAX_OPTIONS + 1))).success).toBe(
      false,
    );
  });
});

describe('adding answers', () => {
  it('appends one', () => {
    const out = addPollOption(['A', 'B']);
    expect(out).toHaveLength(3);
    expect(out.slice(0, 2)).toEqual(['A', 'B']);
  });

  it('the appended answer is non-empty, because the schema forbids a blank one', () => {
    const out = addPollOption(['A', 'B']);
    expect(pollBlockSchema.safeParse(withOptions(newPoll(), out)).success).toBe(true);
  });

  it('stops at the ceiling', () => {
    const full = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(full).toHaveLength(POLL_MAX_OPTIONS);
    expect(canAddPollOption(full)).toBe(false);
    expect(addPollOption(full)).toEqual(full);
    expect(pollBlockSchema.safeParse(withOptions(newPoll(), addPollOption(full))).success).toBe(
      true,
    );
  });

  it('says yes one below the ceiling', () => {
    expect(canAddPollOption(['A', 'B', 'C', 'D', 'E'])).toBe(true);
  });

  it('does not mutate the input', () => {
    const input = ['A', 'B'];
    addPollOption(input);
    expect(input).toEqual(['A', 'B']);
  });
});

describe('removing answers', () => {
  it('drops the one at the index', () => {
    expect(removePollOption(['A', 'B', 'C'], 1)).toEqual(['A', 'C']);
  });

  it('stops at the floor', () => {
    const min = ['A', 'B'];
    expect(min).toHaveLength(POLL_MIN_OPTIONS);
    expect(canRemovePollOption(min)).toBe(false);
    expect(removePollOption(min, 0)).toEqual(min);
    expect(
      pollBlockSchema.safeParse(withOptions(newPoll(), removePollOption(min, 0))).success,
    ).toBe(true);
  });

  it('says yes one above the floor', () => {
    expect(canRemovePollOption(['A', 'B', 'C'])).toBe(true);
  });

  it('ignores an index outside the list', () => {
    expect(removePollOption(['A', 'B', 'C'], 9)).toEqual(['A', 'B', 'C']);
    expect(removePollOption(['A', 'B', 'C'], -1)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input', () => {
    const input = ['A', 'B', 'C'];
    removePollOption(input, 0);
    expect(input).toEqual(['A', 'B', 'C']);
  });
});

describe('editing answer text', () => {
  it('replaces one entry and leaves the rest', () => {
    expect(setPollOption(['A', 'B', 'C'], 1, 'Zed')).toEqual(['A', 'Zed', 'C']);
  });

  it('ignores an index outside the list', () => {
    expect(setPollOption(['A', 'B'], 5, 'Zed')).toEqual(['A', 'B']);
  });

  it('does not mutate the input', () => {
    const input = ['A', 'B'];
    setPollOption(input, 0, 'Zed');
    expect(input).toEqual(['A', 'B']);
  });
});

describe('a poll edited through the panel still parses', () => {
  it('after a realistic sequence of edits', () => {
    let options = newPoll().options;
    options = setPollOption(options, 0, 'Velmi spokojen');
    options = addPollOption(options);
    options = setPollOption(options, options.length - 1, 'Spíš ne');
    options = removePollOption(options, 1);

    const block = { ...newPoll(), question: 'Jak jste spokojeni?', options };
    const parsed = pollBlockSchema.safeParse(block);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('an empty question is rejected, so the panel cannot silently ship one', () => {
    const parsed = pollBlockSchema.safeParse({ ...newPoll(), question: '' });
    expect(parsed.success).toBe(false);
  });

  it('a blank answer is rejected', () => {
    const parsed = pollBlockSchema.safeParse(withOptions(newPoll(), ['A', '']));
    expect(parsed.success).toBe(false);
  });
});
