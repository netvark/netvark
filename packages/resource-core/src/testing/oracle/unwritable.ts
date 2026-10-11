/**
 * Fixtures the oracle cannot write (SPEC 7.3): a value with no text form,
 * a validator's value for a CHECK over several members that is not an
 * object of their values, or a value a storage codec throws on. The report
 * gives the reason in place of a verdict, since the database never sees
 * the value.
 * @packageDocumentation
 */

/** Thrown by the oracle's own writers; the message is the report's reason. */
export class Unwritable extends Error {
  public override readonly name: string = 'Unwritable';
}

/** The report's reason for what a writer threw: the oracle's own, or what a storage codec threw. */
export function unwritableReason(error: unknown): string {
  if (error instanceof Unwritable) {
    return error.message;
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `the storage codec cannot write it: ${reason}`;
}
