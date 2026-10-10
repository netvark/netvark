/**
 * The constants of SPEC 8.3: `N` bounds a length, `L` bounds a range, and
 * a string constant cast to a type is a member or a pattern. A range
 * constant follows every cast in its chain, keeping its value as decimal
 * text and the type PostgreSQL gives it; a chain whose cast would change
 * the number, or fail on every row, gives `null`.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-CONSTANTS-NUMERIC
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html
 * @packageDocumentation
 */
import type { SqlNode } from '../sql/nodes';

/** Which comparison operators a range constant meets: integers, `numeric`, or `float8`. */
export type NumericFamily = 'integer' | 'numeric' | 'float';

type IntegerType = 'smallint' | 'integer' | 'bigint';
type NumericType = IntegerType | 'numeric' | 'double precision';

interface TypedNumber {
  readonly value: string;
  readonly type: NumericType;
}

/** A range bound: decimal text and the family of the type it compares as. */
export interface RangeConstant {
  readonly value: string;
  readonly family: NumericFamily;
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/u;
const SIGNED_INTEGER = /^-?\d+$/u;
const UNSIGNED_INTEGER = /^\d+$/u;
const INTEGRAL = /^-?\d+(?:\.0+)?$/u;
const ZERO_FRACTION = /\.0+$/u;
const NONZERO_DIGIT = /[1-9]/u;
const FAMILIES: Readonly<Record<NumericType, NumericFamily>> = {
  smallint: 'integer',
  integer: 'integer',
  bigint: 'integer',
  numeric: 'numeric',
  'double precision': 'float',
};
/** @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-INT */
const INTEGER_LIMITS: Readonly<Record<IntegerType, readonly [bigint, bigint]>> =
  {
    smallint: [-32_768n, 32_767n],
    integer: [-2_147_483_648n, 2_147_483_647n],
    bigint: [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n],
  };

function isNumericType(type: string): type is NumericType {
  return Object.hasOwn(FAMILIES, type);
}

function isIntegerType(type: NumericType): type is IntegerType {
  return FAMILIES[type] === 'integer';
}

function fitsInteger(value: string, type: IntegerType): boolean {
  const [low, high] = INTEGER_LIMITS[type];
  const integer = BigInt(value);
  return low <= integer && integer <= high;
}

/**
 * Whether a decimal converts to a finite `float8`: `float8in` rejects
 * overflow, and an underflow to zero, as out of range.
 */
function fitsDouble(value: string): boolean {
  const number = Number(value);
  return (
    Number.isFinite(number) && (number !== 0 || !NONZERO_DIGIT.test(value))
  );
}

/** An unquoted number: `integer` when it fits int4, `bigint` when it fits int8, `numeric` otherwise. */
function bareNumber(text: string): TypedNumber | null {
  if (!DECIMAL.test(text)) {
    return null;
  }
  if (text.includes('.')) {
    return { value: text, type: 'numeric' };
  }
  if (fitsInteger(text, 'integer')) {
    return { value: text, type: 'integer' };
  }
  return {
    value: text,
    type: fitsInteger(text, 'bigint') ? 'bigint' : 'numeric',
  };
}

/** A quoted number cast to a numeric type, which PostgreSQL ran through the type's input function. */
function quotedNumber(text: string, type: string): TypedNumber | null {
  if (!isNumericType(type) || !DECIMAL.test(text)) {
    return null;
  }
  if (isIntegerType(type)) {
    return SIGNED_INTEGER.test(text) && fitsInteger(text, type)
      ? { value: text, type }
      : null;
  }
  return type === 'numeric' || fitsDouble(text) ? { value: text, type } : null;
}

/**
 * A further cast in the chain. Nothing leaves `float8`: `float8` to
 * `numeric` keeps 15 significant digits and to an integer type rounds. A
 * cast to an integer type needs an integral value in range, and keeps the
 * integer's text.
 */
function castNumber(inner: TypedNumber, type: string): TypedNumber | null {
  if (!isNumericType(type) || inner.type === 'double precision') {
    return null;
  }
  if (type === 'numeric') {
    return { value: inner.value, type };
  }
  if (type === 'double precision') {
    return fitsDouble(inner.value) ? { value: inner.value, type } : null;
  }
  if (!INTEGRAL.test(inner.value)) {
    return null;
  }
  const integer = BigInt(inner.value.replace(ZERO_FRACTION, '')).toString();
  return fitsInteger(integer, type) ? { value: integer, type } : null;
}

/** `L` of SPEC 8.3, walked from the innermost constant outwards. */
export function rangeConstant(node: SqlNode): RangeConstant | null {
  const casts: Array<string> = [];
  let current = node;
  while (current.kind === 'cast' && current.operand.kind !== 'string') {
    casts.push(current.type);
    current = current.operand;
  }
  let typed: TypedNumber | null = null;
  if (current.kind === 'number') {
    typed = bareNumber(current.text);
  } else if (current.kind === 'cast' && current.operand.kind === 'string') {
    typed = quotedNumber(current.operand.value, current.type);
  }
  for (const type of casts.toReversed()) {
    typed = typed === null ? null : castNumber(typed, type);
  }
  return typed === null
    ? null
    : { value: typed.value, family: FAMILIES[typed.type] };
}

/** `N` of SPEC 8.3: an unsigned integer constant. */
export function lengthConstant(node: SqlNode): number | null {
  if (node.kind !== 'number' || !UNSIGNED_INTEGER.test(node.text)) {
    return null;
  }
  const value = Number(node.text);
  return Number.isSafeInteger(value) ? value : null;
}

/** The text of a string constant cast to one of `types`, such as `'active'::text`. */
export function stringConstant(
  node: SqlNode,
  types: ReadonlySet<string>,
): string | null {
  return node.kind === 'cast' &&
    node.operand.kind === 'string' &&
    types.has(node.type)
    ? node.operand.value
    : null;
}
