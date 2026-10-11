/**
 * The operator table (SPEC 4.2): which operators each field type accepts.
 * One table serves validation of a definition's `operators` option, the
 * planner's checks, and the documentation.
 * @packageDocumentation
 */
import type { FieldType, Operator } from '../definition/types';
import type { ArrayOperator, ComparisonOperator } from '../plan/types';

type EqualityOperator = 'eq' | 'ne';
type MembershipOperator = 'in' | 'nin';
type OrderedOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'between';

const EQUALITY: ReadonlyArray<EqualityOperator> = ['eq', 'ne'];
const MEMBERSHIP: ReadonlyArray<MembershipOperator> = ['in', 'nin'];
const ORDERED: ReadonlyArray<OrderedOperator> = [
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
];
const PATTERNS: ReadonlyArray<PatternOperator> = [
  'contains',
  'startsWith',
  'endsWith',
  'eqi',
  'containsi',
  'startsWithi',
  'endsWithi',
];
const ARRAY: ReadonlyArray<ArrayOperator> = [
  'contains',
  'containedBy',
  'overlaps',
];

/** Text operators that become `LIKE` or `ILIKE` patterns. */
export type PatternOperator =
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'eqi'
  | 'containsi'
  | 'startsWithi'
  | 'endsWithi';

/**
 * The operators a field of `TType` accepts (SPEC 4.2), without the `isNull`
 * a nullable field adds: the type-level twin of `operatorsFor`, for a
 * library that checks a field's operators before it builds a definition.
 */
export type OperatorsOf<TType extends FieldType> = TType extends 'array'
  ? ArrayOperator
  : TType extends 'boolean'
    ? EqualityOperator
    : TType extends 'uuid' | 'enum'
      ? EqualityOperator | MembershipOperator
      : TType extends 'text'
        ?
            | EqualityOperator
            | MembershipOperator
            | OrderedOperator
            | PatternOperator
        : EqualityOperator | MembershipOperator | OrderedOperator;

/** Typed by `OperatorsOf`, so the table never lists an operator the type does not. */
const BY_TYPE: {
  readonly [TType in FieldType]: ReadonlyArray<OperatorsOf<TType>>;
} = {
  text: [...EQUALITY, ...MEMBERSHIP, ...ORDERED, ...PATTERNS],
  integer: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  bigint: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  decimal: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  float: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  boolean: EQUALITY,
  uuid: [...EQUALITY, ...MEMBERSHIP],
  enum: [...EQUALITY, ...MEMBERSHIP],
  date: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  time: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  timestamp: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  timestamptz: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  array: ARRAY,
};

export const OPERATORS: ReadonlyArray<Operator> = [
  ...EQUALITY,
  ...MEMBERSHIP,
  ...ORDERED,
  'isNull',
  ...PATTERNS,
  'containedBy',
  'overlaps',
];

const ALL: ReadonlySet<string> = new Set<string>(OPERATORS);
const PATTERN_SET: ReadonlySet<string> = new Set<string>(PATTERNS);
const ARRAY_SET: ReadonlySet<string> = new Set<string>(ARRAY);

/** SQL comparison per operator; `undefined` for operators that are not comparisons. */
const COMPARISONS: Readonly<Partial<Record<Operator, ComparisonOperator>>> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** The operators a field of `type` accepts; `isNull` is added for nullable fields. */
export function operatorsFor(
  type: FieldType,
  nullable: boolean,
): ReadonlySet<Operator> {
  return new Set(nullable ? [...BY_TYPE[type], 'isNull'] : BY_TYPE[type]);
}

export function isOperator(value: unknown): value is Operator {
  return typeof value === 'string' && ALL.has(value);
}

export function isPatternOperator(value: Operator): value is PatternOperator {
  return PATTERN_SET.has(value);
}

export function isArrayOperator(value: Operator): value is ArrayOperator {
  return ARRAY_SET.has(value);
}

export function comparisonOf(value: Operator): ComparisonOperator | undefined {
  return COMPARISONS[value];
}
