/**
 * The seek predicate (SPEC 6.2, ADR 0016): "rows after the cursor" or
 * "rows before the cursor" in a total order over several keys with
 * `NULLS LAST`, as a disjunction of prefix-equality conjunctions. Nulls
 * sort after every value in both directions, so after a null there is
 * nothing on that key, before a null there is every non-null value, and
 * after a value there is every greater (or smaller, descending) value and,
 * on a nullable key, every null. Over several keys the disjunction leads
 * with a range on the first key that every row it selects lies in, so an
 * index on the sort starts its scan at the cursor instead of filtering
 * every entry before it: PostgreSQL uses a comparison joined by `and` as
 * an index condition, never one inside an `or`. A page runs the seek as
 * branches instead (ADR 0020), one conjunction per disjunct, which an
 * index bounds inside a tie of the first key and after a value of a
 * nullable one too.
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS LAST, later keys break ties)
 * @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page ("we can add this redundant condition manually")
 * @ref https://www.postgresql.org/docs/current/indexes-types.html#INDEXES-TYPES-BTREE (IS NULL is an indexable condition)
 * @ref https://www.postgresql.org/docs/current/queries-union.html (a union keeps no order)
 * @packageDocumentation
 */
import type { SortDirection } from '../definition/types';
import type { CursorValue, PlanKey, Predicate } from './types';

type Side = 'after' | 'before';
type SeekKey = Pick<PlanKey, 'target' | 'direction' | 'nullable'>;

const FALSE: Predicate = { kind: 'literal', value: false };

function compare(
  key: SeekKey,
  operator: '=' | '>' | '>=' | '<' | '<=',
  value: string,
): Predicate {
  return { kind: 'compare', target: key.target, operator, value };
}

function isNull(key: SeekKey, negate: boolean): Predicate {
  return { kind: 'null', target: key.target, negate };
}

function equal(key: SeekKey, value: CursorValue): Predicate {
  return value === null ? isNull(key, false) : compare(key, '=', value);
}

function forward(key: SeekKey): boolean {
  return (key.direction satisfies SortDirection) === 'asc';
}

/**
 * The conditions on `key` alone of the rows past `value`, each one an
 * index can bound: none after a null; after a value the greater (smaller,
 * descending) values and, on a nullable key, the nulls; before a null
 * every value; before a value the smaller (greater) values.
 */
function bounds(
  key: SeekKey,
  value: CursorValue,
  side: Side,
): Array<Predicate> {
  if (side === 'after') {
    if (value === null) {
      return [];
    }
    const greater = compare(key, forward(key) ? '>' : '<', value);
    return key.nullable ? [greater, isNull(key, false)] : [greater];
  }
  if (value === null) {
    return [isNull(key, true)];
  }
  return [compare(key, forward(key) ? '<' : '>', value)];
}

function beyond(key: SeekKey, value: CursorValue, side: Side): Predicate {
  const [only, ...rest] = bounds(key, value, side);
  if (only === undefined) {
    return FALSE;
  }
  return rest.length === 0 ? only : { kind: 'or', items: [only, ...rest] };
}

/** Equality with the cursor on every key before the one at `index`. */
function prefixOf(
  keys: ReadonlyArray<SeekKey>,
  values: ReadonlyArray<CursorValue>,
  index: number,
): Array<Predicate> {
  return keys
    .slice(0, index)
    .map((key, position) => equal(key, values[position] ?? null));
}

/** `items` joined with `and`; a single one as itself. */
function conjunction(items: ReadonlyArray<Predicate>): Predicate {
  const [only] = items;
  return only !== undefined && items.length === 1
    ? only
    : { kind: 'and', items };
}

/**
 * The range on the first key that every row of the seek lies in, or
 * `null` where none does. After a value it holds the value and beyond, on
 * a key that is not nullable, since the rows after a value on a nullable
 * key include its nulls; after a null it is the nulls. Before a value it
 * holds the value and every value before it, nullable or not, since no
 * null sorts before a value; before a null every row may lie.
 */
function leadingRange(
  key: SeekKey,
  value: CursorValue,
  side: Side,
): Predicate | null {
  if (side === 'after') {
    if (value === null) {
      return isNull(key, false);
    }
    return key.nullable
      ? null
      : compare(key, forward(key) ? '>=' : '<=', value);
  }
  return value === null
    ? null
    : compare(key, forward(key) ? '<=' : '>=', value);
}

/**
 * `keys` carry the request's directions (not the inverted ones of a
 * backward page) and their fields' nullability; `values` is the cursor's
 * value per key.
 */
export function seekPredicate(
  keys: ReadonlyArray<SeekKey>,
  values: ReadonlyArray<CursorValue>,
  side: Side,
): Predicate {
  const alternatives = keys.map((key, index) =>
    conjunction([
      ...prefixOf(keys, values, index),
      beyond(key, values[index] ?? null, side),
    ]),
  );
  const [first, ...rest] = keys;
  if (first === undefined || rest.length === 0) {
    return alternatives[0] ?? FALSE;
  }
  const disjunction: Predicate = { kind: 'or', items: alternatives };
  const range = leadingRange(first, values[0] ?? null, side);
  return range === null
    ? disjunction
    : { kind: 'and', items: [range, disjunction] };
}

/**
 * The seek as branches (ADR 0020): for each key, the rows equal to the
 * cursor on every earlier key and past it on this one, the nulls after a
 * value of a nullable key a branch of their own. Each branch is a
 * conjunction an index on the sort bounds as a range; the branches are
 * disjoint, and together they select the rows `seekPredicate` does. A
 * cursor no row can follow, after a null on its last key, which
 * `finishPage` never signs, is the one branch `false`.
 */
export function seekBranches(
  keys: ReadonlyArray<SeekKey>,
  values: ReadonlyArray<CursorValue>,
  side: Side,
): Array<Predicate> {
  const branches = keys.flatMap((key, index) => {
    const prefix = prefixOf(keys, values, index);
    return bounds(key, values[index] ?? null, side).map((bound) =>
      conjunction([...prefix, bound]),
    );
  });
  return branches.length === 0 ? [FALSE] : branches;
}

/**
 * A page's seek (SPEC 6.1, ADR 0020): no branch without a cursor; the
 * branches of `after` when it is given, each also holding the predicate
 * for `before` when that is given too, whose range bounds where each
 * branch's scan ends; else the branches of `before`. When the first key
 * is an aggregate, which no index holds, a side is one branch, its
 * predicate, so the aggregate is computed for every row once, not once
 * per branch.
 */
export function pageSeek(
  keys: ReadonlyArray<SeekKey>,
  after: ReadonlyArray<CursorValue> | null,
  before: ReadonlyArray<CursorValue> | null,
): Array<Predicate> {
  const indexed = keys[0]?.target.kind === 'column';
  const split = (values: ReadonlyArray<CursorValue>, side: Side) =>
    indexed
      ? seekBranches(keys, values, side)
      : [seekPredicate(keys, values, side)];
  if (after === null) {
    return before === null ? [] : split(before, 'before');
  }
  const branches = split(after, 'after');
  if (before === null) {
    return branches;
  }
  const end = seekPredicate(keys, before, 'before');
  return branches.map((branch) => conjunction([branch, end]));
}
