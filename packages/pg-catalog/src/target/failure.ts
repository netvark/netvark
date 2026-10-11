/**
 * What a driver error says: PGlite and node-postgres both carry
 * PostgreSQL's message, SQLSTATE, and position on the error they throw.
 * The detail is left out, since it may echo the data.
 * @ref https://www.postgresql.org/docs/18/protocol-error-fields.html
 * @packageDocumentation
 */

interface Failure {
  readonly message: string;
  readonly code: string | null;
  readonly position: number | null;
}

function member(error: object, key: string): unknown {
  return Reflect.get(error, key);
}

/** The message, SQLSTATE, and 1-based character position of a driver error. */
export function failureOf(error: unknown): Failure {
  if (typeof error !== 'object' || error === null) {
    return { message: String(error), code: null, position: null };
  }
  const message = member(error, 'message');
  const code = member(error, 'code');
  const position = Number(member(error, 'position'));
  return {
    message: typeof message === 'string' ? message : 'unknown error',
    code: typeof code === 'string' ? code : null,
    position: Number.isInteger(position) && position > 0 ? position : null,
  };
}

/** The message and SQLSTATE of a driver error, for a report. */
export function failureMessage(error: unknown): string {
  const failure = failureOf(error);
  return failure.code === null
    ? failure.message
    : `${failure.message} (SQLSTATE ${failure.code})`;
}
