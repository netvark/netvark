/**
 * How a member's schemas and the database disagree on a write (SPEC 7.3,
 * 15.3): a value the write schema accepts must be stored as the same
 * value, and one it refuses must be refused, or stored as a value whose
 * read form does not give back what was sent (SPEC 5.2); and every value
 * the database stores must read as a value the read schema accepts.
 * `null` is stored as SQL `NULL` or refused, never changed.
 * @packageDocumentation
 */
import type { ColumnType } from '../../wire/column-type';
import type { OracleVerdict } from './types';

import { readForm, UNREPRESENTABLE } from '../../wire/read-form';
import { sameValue } from './same-value';

/** A refusal as a report shows it: the SQLSTATE, and the constraint it names. */
export function refusal(
  verdict: Extract<OracleVerdict, { readonly accepted: false }>,
): string {
  return verdict.constraint === null
    ? verdict.code
    : `${verdict.code} ${verdict.constraint}`;
}

/** What a write schema judges: its verdict on the value sent, and whether a read form gives that value back as sent. */
export interface WriteJudgement {
  readonly accepted: boolean;
  readonly givesBack: (read: unknown) => boolean;
}

/** How the write schema's verdict on `sent` and the database's disagree, or `undefined`. */
export function writeDisagreement(
  sent: unknown,
  write: WriteJudgement,
  stored: string | null | undefined,
  verdict: OracleVerdict,
  type: ColumnType,
): string | undefined {
  if (!verdict.accepted) {
    return write.accepted
      ? `the schema accepts it; the database refuses it (${refusal(verdict)})`
      : undefined;
  }
  if (stored === null || stored === undefined) {
    return (sent === null) === write.accepted
      ? undefined
      : `the schema ${write.accepted ? 'accepts' : 'refuses'} it; the database stores NULL`;
  }
  const read = readForm(stored, type);
  if (write.accepted) {
    return read !== UNREPRESENTABLE && sameValue(read, sent, type)
      ? undefined
      : `the schema accepts it; the database stores ${stored}`;
  }
  return read !== UNREPRESENTABLE && write.givesBack(read)
    ? 'the schema refuses it; the database stores it as sent'
    : undefined;
}

/** Whether the read schema refuses what the database stored, or `undefined`; a value outside the read form is the adapter's to refuse. */
export function readDisagreement(
  stored: string | null | undefined,
  type: ColumnType,
  accepts: (read: unknown) => boolean,
): string | undefined {
  if (stored === null || stored === undefined) {
    return undefined;
  }
  const read = readForm(stored, type);
  return read === UNREPRESENTABLE || accepts(read)
    ? undefined
    : `the database stores ${stored}, which the read schema refuses`;
}
