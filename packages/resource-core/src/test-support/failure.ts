/**
 * The message of the `TypeError` a call throws, for asserting startup
 * errors (SPEC 14). Not published with the package.
 * @packageDocumentation
 */

/** Runs `run` and returns its `TypeError`'s message; fails when it returns or throws anything else. */
export function typeErrorOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected a TypeError');
}
