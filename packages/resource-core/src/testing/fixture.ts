/**
 * A boundary fixture (SPEC 15.3): a wire value at or next to a limit, with
 * a label naming the limit, so an oracle's failure says what it probed.
 * @packageDocumentation
 */

/** A wire value at or next to a limit of a member's value. */
export interface BoundaryFixture {
  /** The value as a client sends it: a JSON value, or for a relationship the id. */
  readonly value: unknown;
  /** What the value probes, such as `maxLength 3, plus one`. */
  readonly label: string;
}

function deepFreeze(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
    Object.freeze(value);
  }
  return value;
}

/** A fixture, frozen with its value: the lists are shared between calls. */
export function fixture(value: unknown, label: string): BoundaryFixture {
  return Object.freeze({ value: deepFreeze(value), label });
}

/** The fixtures with the first of each value kept: two limits may meet at one value. */
export function distinct(
  fixtures: ReadonlyArray<BoundaryFixture>,
): ReadonlyArray<BoundaryFixture> {
  const seen = new Set<string>();
  return fixtures.filter(({ value }) => {
    const key = `${typeof value}:${JSON.stringify(value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
