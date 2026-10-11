/**
 * Parameter text (SPEC 18.2, obligation 4 of resource SPEC 12.8): a write's
 * value becomes the text its column's input function reads. The write
 * schemas (resource SPEC 6) have already refused every value outside the
 * write forms of SPEC 5.1, so the adapter converts and never validates.
 * @packageDocumentation
 */
import type { ColumnType } from './column-type';

import { arrayLiteral } from './array-literal';

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new TypeError(`no parameter text for a value of type ${typeof value}`);
}

/**
 * The text of `value` for a column of `type`: a string as it is, a number
 * with `String`, a boolean as `true` or `false`, a `json` or `jsonb` value
 * with `JSON.stringify`, and an array, whose elements are never null, as
 * an array literal.
 */
export function parameterText(value: unknown, type: ColumnType): string {
  if (type.base === 'json' || type.base === 'jsonb') {
    return JSON.stringify(value);
  }
  if (type.array && Array.isArray(value)) {
    return arrayLiteral(value.map((element: unknown) => scalarText(element)));
  }
  return scalarText(value);
}
