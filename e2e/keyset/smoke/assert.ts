/**
 * The smoke checks' assertions: a failed one throws, and `runChecks`
 * collects its message, so one report covers every check.
 */

/** One check: resolves when it holds, rejects with what failed. */
export type Check = () => Promise<void>;

class CheckFailure extends Error {
  override readonly name: string = 'CheckFailure';
}

/** Fails the check with `message` unless `condition` holds. */
export function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new CheckFailure(message);
  }
}

/** Fails the check unless `actual` is `expected`, naming `what` differed. */
export function equal(actual: unknown, expected: unknown, what: string): void {
  check(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}
