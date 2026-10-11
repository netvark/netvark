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
 * an index condition, never one inside an `or`.
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS LAST, later keys break ties)
 * @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page ("we can add this redundant condition manually")
 * @ref https://www.postgresql.org/docs/current/indexes-types.html#INDEXES-TYPES-BTREE (IS NULL is an indexable condition)
 * @packageDocumentation
 */
import type { SortDirection } from '../definition/types';
import type { CursorValue, PlanKey, Predicate } from './types';

type Side = 'after' | 'before';
type SeekKey = Pick<PlanKey, 'target' | 'direction' | 'nullable'>;

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

function beyond(key: SeekKey, value: CursorValue, side: Side): Predicate {
  if (side === 'after') {
    if (value === null) {
      return { kind: 'literal', value: false };
    }
    const greater = compare(key, forward(key) ? '>' : '<', value);
    return key.nullable
      ? { kind: 'or', items: [greater, isNull(key, false)] }
      : greater;
  }
  if (value === null) {
    return isNull(key, true);
  }
  return compare(key, forward(key) ? '<' : '>', value);
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
  const alternatives: Array<Predicate> = keys.map((key, index) => {
    const prefix = keys
      .slice(0, index)
      .map((k, j) => equal(k, values[j] ?? null));
    const last = beyond(key, values[index] ?? null, side);
    return prefix.length === 0
      ? last
      : { kind: 'and', items: [...prefix, last] };
  });
  const [first, ...rest] = keys;
  if (first === undefined || rest.length === 0) {
    return alternatives[0] ?? { kind: 'literal', value: false };
  }
  const disjunction: Predicate = { kind: 'or', items: alternatives };
  const range = leadingRange(first, values[0] ?? null, side);
  return range === null
    ? disjunction
    : { kind: 'and', items: [range, disjunction] };
}
