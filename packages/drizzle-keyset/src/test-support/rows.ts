/**
 * Rows as the canned driver returns them for the test selection
 * `{ id, firstName }`: arrays of values in the order of the selection,
 * the keys under their aliases last.
 */
export const ID = '00000000-0000-4000-8000-00000000000';

/** Contact `n` as `[id, firstName, ...keys]`; its only key is its id unless `keys` are given. */
export function row(n: number, ...keys: Array<unknown>): Array<unknown> {
  const id = `${ID}${String(n)}`;
  return [id, `name${String(n)}`, ...(keys.length === 0 ? [id] : keys)];
}
