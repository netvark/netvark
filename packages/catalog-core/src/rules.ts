/**
 * The rules the CHECK recognizer reads from constraints (SPEC 2.9, ADR 0006).
 * A rule states a predicate over the non-null values of a column's type,
 * after PostgreSQL's input conversion and type modifier coercion, and is
 * true exactly when its CHECK is: a client can enforce it before a request
 * and get the database's verdict.
 * @packageDocumentation
 */

/** Character length bounds, counted in Unicode code points, both inclusive. */
export interface LengthRule {
  readonly kind: 'length';
  readonly min: number | null;
  readonly max: number | null;
}

/**
 * One end of a numeric range. `value` is a decimal literal
 * (`/^-?\d+(\.\d+)?$/`) kept as text, so `numeric` and `int8` bounds keep
 * every digit.
 */
export interface RangeBound {
  readonly value: string;
  readonly inclusive: boolean;
}

/**
 * Numeric bounds over finite numbers: PostgreSQL orders `NaN` above every
 * number, and JSON carries neither `NaN` nor infinities.
 */
export interface RangeRule {
  readonly kind: 'range';
  readonly min: RangeBound | null;
  readonly max: RangeBound | null;
}

/** Membership in a list of strings, in the CHECK's order. */
export interface EnumRule {
  readonly kind: 'enum';
  readonly values: ReadonlyArray<string>;
}

/** The value must not be null. */
export interface NotNullRule {
  readonly kind: 'notNull';
}

/**
 * A regular expression that PostgreSQL and JavaScript read identically:
 * `source` is the PostgreSQL pattern unchanged, valid JavaScript with the
 * flags `su` (SPEC 8.4).
 */
export interface PatternRule {
  readonly kind: 'pattern';
  readonly source: string;
  readonly flags: 'su';
}

/** Any rule the recognizer can read from a CHECK constraint. */
export type Rule =
  | LengthRule
  | RangeRule
  | EnumRule
  | NotNullRule
  | PatternRule;
