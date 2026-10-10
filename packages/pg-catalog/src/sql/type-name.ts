/**
 * Reads a type name after `::` as `format_type` prints it (SPEC 8.2): a
 * word or quoted identifier, optionally schema-qualified, the multiword
 * spellings such as `character varying` and `timestamp(3) with time zone`,
 * an optional modifier, and `[]` suffixes.
 * @ref https://www.postgresql.org/docs/18/datatype.html
 * @packageDocumentation
 */
import type { TokenCursor } from './cursor';

import { Unparsable } from './cursor';

/** Words that may follow a type name inside its spelling. */
const TYPE_WORDS: ReadonlySet<string> = new Set([
  'varying',
  'precision',
  'with',
  'without',
  'time',
  'zone',
  'to',
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'second',
]);

function name(cursor: TokenCursor): number {
  const token = cursor.take();
  if (token.kind !== 'word' && token.kind !== 'identifier') {
    throw new Unparsable();
  }
  return token.end;
}

function modifierValue(cursor: TokenCursor): void {
  cursor.accept('-');
  if (cursor.take().kind !== 'number') {
    throw new Unparsable();
  }
}

/** A modifier such as `(10)` or `(5,-2)`; returns the offset after `)`. */
function modifier(cursor: TokenCursor): number {
  cursor.expect('(');
  modifierValue(cursor);
  while (cursor.accept(',')) {
    modifierValue(cursor);
  }
  return cursor.expect(')').end;
}

/** The type's spelling, sliced from `sql` exactly as printed. */
export function readTypeName(cursor: TokenCursor, sql: string): string {
  const start = cursor.peek()?.start ?? sql.length;
  let end = name(cursor);
  if (cursor.accept('.')) {
    end = name(cursor);
  }
  for (;;) {
    const token = cursor.peek();
    if (token?.kind === 'word' && TYPE_WORDS.has(token.text)) {
      end = cursor.take().end;
    } else if (cursor.sees('(')) {
      end = modifier(cursor);
    } else {
      break;
    }
  }
  while (cursor.sees('[') && cursor.sees(']', 1)) {
    cursor.take();
    end = cursor.take().end;
  }
  return sql.slice(start, end);
}
