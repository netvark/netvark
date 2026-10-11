/** Rows as the canned driver returns them: the caller's columns and the key under its alias. */
export const ID = '00000000-0000-4000-8000-00000000000';

/** Contact row `n`, its key selected as `keyset0`, with `extra` members over it. */
export function row(
  n: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `${ID}${n}`,
    first_name: `name${n}`,
    keyset0: `${ID}${n}`,
    ...extra,
  };
}
