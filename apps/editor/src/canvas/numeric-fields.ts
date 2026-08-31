/**
 * Number inputs, which are the quiet way a property panel produces a block
 * that no longer parses.
 *
 * `Number('')` is 0, not NaN. So the obvious `onChange={e => update({ width:
 * Number(e.target.value) })}` turns an emptied field into the number zero,
 * and `videoBlockSchema.width` is `.positive()`, so zero fails. The user sees
 * an empty box and a block that will not save, with nothing connecting the
 * two. `Number('abc')` is NaN, which fails `.int()` the same way.
 *
 * An HTML `min`/`max` attribute does not help either: it styles the field and
 * gates form submission, and there is no form here. Typing 900 into
 * `<input type="number" max="64">` fires onChange with 900.
 *
 * Both helpers below therefore convert rather than trust.
 */

/**
 * A cleared or unusable number field means "no value", not zero.
 *
 * Returns undefined for blank, whitespace, NaN, zero and negatives — every
 * input that `z.number().int().positive().optional()` would reject — so the
 * field round-trips to `undefined` and the block stays valid. Fractions are
 * truncated towards zero, because `.int()` rejects them and dropping the
 * user's number entirely would be ruder than rounding it.
 */
export function parseOptionalPositiveInt(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i > 0 ? i : undefined;
}

/**
 * A bounded required number field, clamped into range.
 *
 * Used for `socialBlockSchema.iconSize` (int, 16..64). Blank or unusable
 * input keeps `fallback` rather than becoming zero — there is no "no value"
 * for a required field, so the previous value is the honest answer.
 */
export function parseBoundedInt(raw: string, min: number, max: number, fallback: number): number {
  if (raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
