/**
 * The literal of a column or domain default, when the deparsed default is a
 * constant a client can send as text and get the same stored value (SPEC
 * 7.3). The forms follow `get_const_expr` in PostgreSQL's `ruleutils.c`: a
 * non-negative `int4` and a non-negative non-integral `numeric` print bare,
 * other constants print quoted with a cast to their type, and a top-level
 * implicit cast (to the column type, or to the domain) is not printed.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ruleutils.c
 * @packageDocumentation
 */
import { tokenize } from '../sql/tokenize';

/** The base type a default is stored in: the column's or domain's type, resolved through domains. */
export interface DefaultBase {
  readonly schema: string;
  readonly name: string;
  /** `format_type(base, -1)`, how `get_const_expr` labels a constant of the type: `bpchar`, not `character`. */
  readonly spelling: string;
}

const UNSIGNED_INTEGRAL = /^\d+$/u;
const UNSIGNED_FRACTIONAL = /^\d+\.\d+$/u;
const INTEGRAL = /^-?\d+$/u;
const FRACTIONAL = /^-?\d+\.\d+$/u;
/** Base types an integral constant converts to without changing its value. */
const INTEGRAL_BASES = new Set([
  'int2',
  'int4',
  'int8',
  'numeric',
  'float4',
  'float8',
]);
/** Base types a fractional constant converts to keeping its value (an integer column would round it). */
const FRACTIONAL_BASES = new Set(['numeric', 'float4', 'float8']);
/** The types an integral constant is labeled with: `int4` beyond its sign, `int8`, and `numeric`. */
const INTEGRAL_LABELS = new Set(['integer', 'bigint', 'numeric']);

function builtin(base: DefaultBase, names: ReadonlySet<string>): boolean {
  return base.schema === 'pg_catalog' && names.has(base.name);
}

function bareLiteral(expression: string, base: DefaultBase): string | null {
  if (expression === 'true' || expression === 'false') {
    return builtin(base, new Set(['bool'])) ? expression : null;
  }
  if (UNSIGNED_INTEGRAL.test(expression)) {
    return builtin(base, INTEGRAL_BASES) ? expression : null;
  }
  if (UNSIGNED_FRACTIONAL.test(expression)) {
    return builtin(base, FRACTIONAL_BASES) ? expression : null;
  }
  return null;
}

function castLiteral(
  text: string,
  label: string,
  base: DefaultBase,
): string | null {
  if (label === base.spelling) {
    return text;
  }
  if (INTEGRAL_LABELS.has(label) && INTEGRAL.test(text)) {
    return builtin(base, INTEGRAL_BASES) ? text : null;
  }
  if (label === 'numeric' && FRACTIONAL.test(text)) {
    return builtin(base, FRACTIONAL_BASES) ? text : null;
  }
  return null;
}

/**
 * The constant's text when `expression` (a `pg_get_expr` of a default) is
 * one of the accepted forms for `base`, or `null`: function calls,
 * operators, `CURRENT_TIMESTAMP`, `nextval(...)`, and casts the deparser
 * hid where they change the value (a `1.5` default on an `integer` column
 * stores `2`) all give `null`.
 */
export function defaultLiteral(
  expression: string,
  base: DefaultBase,
): string | null {
  const bare = bareLiteral(expression, base);
  if (bare !== null) {
    return bare;
  }
  const tokens = tokenize(expression);
  const [constant, cast, label] = tokens ?? [];
  if (
    constant?.kind !== 'string' ||
    constant.start !== 0 ||
    cast?.text !== '::' ||
    label === undefined
  ) {
    return null;
  }
  return castLiteral(constant.text, expression.slice(label.start), base);
}
