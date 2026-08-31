/**
 * Editing the answer list of a poll block.
 *
 * Pure on purpose. apps/editor tests run under vitest `environment: 'node'`
 * with no DOM and no testing-library, so a React component here could not be
 * asserted on at all. Everything that can be got wrong therefore lives in
 * these functions, and PollEditor is left as wiring.
 *
 * The limits are duplicated from pollBlockSchema, which is a real risk — a
 * second copy of a number is how the palette drifted in the first place. The
 * duplication is kept honest by poll-options.test.ts, which does not trust
 * these constants: it feeds the four boundary lengths through
 * `pollBlockSchema.safeParse` and asserts the schema agrees. Change the
 * schema and forget this file, and that test goes red.
 */

/** Fewer than two answers is not a poll. */
export const POLL_MIN_OPTIONS = 2;
/** Past six, the buttons stop fitting a phone and the answers stop being analysable. */
export const POLL_MAX_OPTIONS = 6;

const NEW_OPTION_TEXT = 'New answer';

export function canAddPollOption(options: readonly string[]): boolean {
  return options.length < POLL_MAX_OPTIONS;
}

export function canRemovePollOption(options: readonly string[]): boolean {
  return options.length > POLL_MIN_OPTIONS;
}

/**
 * Append an answer. At the ceiling this returns the list unchanged rather
 * than throwing: the button that calls it is disabled, so reaching here means
 * something else went wrong, and a panel that crashes the editor is worse
 * than a panel that declines. The caller renders `canAddPollOption` as the
 * disabled state, so the user is told before they click, not after.
 */
export function addPollOption(options: readonly string[]): string[] {
  if (!canAddPollOption(options)) return [...options];
  return [...options, NEW_OPTION_TEXT];
}

/**
 * Drop the answer at `index`. Refuses at the floor, and refuses an index that
 * is not in the list — both by returning the list unchanged, for the same
 * reason as above.
 */
export function removePollOption(options: readonly string[], index: number): string[] {
  if (!canRemovePollOption(options)) return [...options];
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return [...options];
  return options.filter((_, i) => i !== index);
}

/** Replace the text of one answer. Out-of-range index is a no-op. */
export function setPollOption(options: readonly string[], index: number, text: string): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return [...options];
  return options.map((o, i) => (i === index ? text : o));
}
