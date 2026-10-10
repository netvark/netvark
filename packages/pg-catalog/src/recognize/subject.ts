/**
 * The subject of a CHECK (SPEC 8.1, 8.3): the column a table CHECK names,
 * or a domain's `VALUE`; the type facts that decide which rules apply; and
 * the casts the subject may appear under in the deparsed text.
 * @packageDocumentation
 */
import type { SqlNode } from '../sql/nodes';
import type { NumericFamily } from './constants';

/** What the recognizer needs to know about a CHECK's subject. */
export interface CheckSubject {
  /** The column a table CHECK names, or `null` for a domain CHECK over `VALUE`. */
  readonly column: string | null;
  /** Whether the subject's own type is a domain: a column of a domain type, or the `VALUE` of a domain over a domain. */
  readonly domain: boolean;
  readonly array: boolean;
  /** The type the value rests on, resolved through domains. */
  readonly baseSchema: string;
  readonly baseName: string;
  /** `typtype` of the base type. */
  readonly baseType: string;
  /** `format_type(base, -1)`, the spelling the deparser gives casts to the base type. */
  readonly baseSpelling: string;
  /** Whether the collation the CHECK compares under is deterministic; `null` for a type without one. */
  readonly deterministic: boolean | null;
}

const BUILTIN_SCHEMA = 'pg_catalog';
const TEXT_BASES: ReadonlySet<string> = new Set(['text', 'varchar']);
const NUMERIC_BASES: ReadonlyMap<string, NumericFamily> = new Map([
  ['int2', 'integer'],
  ['int4', 'integer'],
  ['int8', 'integer'],
  ['numeric', 'numeric'],
  ['float8', 'float'],
]);
/**
 * A name `quote_identifier` leaves unquoted: lower-case ASCII letters,
 * digits, and `_`, not starting with a digit. Any other column name is
 * printed quoted, so a bare word with another spelling is not the column.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
 */
const PLAIN_NAME = /^[a-z_][a-z0-9_]*$/u;
/** The keyword the deparser prints for a domain CHECK's value. */
const DOMAIN_VALUE = 'VALUE';

function isReference(node: SqlNode, subject: CheckSubject): boolean {
  if (node.kind !== 'identifier') {
    return false;
  }
  if (subject.column === null) {
    return !node.quoted && node.name === DOMAIN_VALUE;
  }
  return (
    node.name === subject.column &&
    (node.quoted || PLAIN_NAME.test(subject.column))
  );
}

/**
 * The casts SPEC 8.3 lets the subject carry: to `text` or `character
 * varying` without a modifier, which is how the deparser shows a `varchar`
 * given to a text operator, and from a domain to its base type.
 */
function isAllowedCast(type: string, subject: CheckSubject): boolean {
  return (
    type === 'text' ||
    type === 'character varying' ||
    (subject.domain && type === subject.baseSpelling)
  );
}

/** The casts around the subject, outermost first; `null` when `node` is not the subject. */
function subjectCasts(
  node: SqlNode,
  subject: CheckSubject,
): ReadonlyArray<string> | null {
  const casts: Array<string> = [];
  let current = node;
  while (current.kind === 'cast') {
    if (!isAllowedCast(current.type, subject)) {
      return null;
    }
    casts.push(current.type);
    current = current.operand;
  }
  return isReference(current, subject) ? casts : null;
}

/** Whether `node` is the subject under allowed casts, none of which changes whether it is null. */
export function isSubject(node: SqlNode, subject: CheckSubject): boolean {
  return subjectCasts(node, subject) !== null;
}

/**
 * The type an operator or function receives the subject as: the outermost
 * cast, or the subject's own type when there is none. PostgreSQL's own
 * operators always receive a domain through a cast to its base type, so an
 * uncast domain means an operator defined on the domain itself, and gives
 * `null`.
 */
export function subjectType(
  node: SqlNode,
  subject: CheckSubject,
): string | null {
  const casts = subjectCasts(node, subject);
  if (casts === null) {
    return null;
  }
  const [outer] = casts;
  if (outer !== undefined) {
    return outer;
  }
  return subject.domain ? null : subject.baseSpelling;
}

/** Length, pattern, and text membership: `text` or `varchar`, not an array, compared under a deterministic collation. */
export function isTextual(subject: CheckSubject): boolean {
  return (
    !subject.array &&
    subject.deterministic === true &&
    subject.baseSchema === BUILTIN_SCHEMA &&
    TEXT_BASES.has(subject.baseName)
  );
}

/** Enum membership: an enum, not an array. */
export function isEnum(subject: CheckSubject): boolean {
  return !subject.array && subject.baseType === 'e';
}

/** The numeric family of a range subject: `int2`, `int4`, `int8`, `numeric`, or `float8`, not an array. */
export function numericFamily(subject: CheckSubject): NumericFamily | null {
  if (subject.array || subject.baseSchema !== BUILTIN_SCHEMA) {
    return null;
  }
  return NUMERIC_BASES.get(subject.baseName) ?? null;
}
