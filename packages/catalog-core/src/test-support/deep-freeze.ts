/**
 * Freezes a value and everything it holds, so a test proves a function
 * never writes its input. Not published with the package.
 * @packageDocumentation
 */

/** `value`, frozen all the way down. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
    Object.freeze(value);
  }
  return value;
}
