/**
 * The seek's branches (SPEC 6.2, ADR 0020) held to an oracle: for every
 * cursor over a grid of rows, the rows the branches select are the rows
 * past the cursor in a total order computed in JavaScript (nulls last on
 * every key, in both directions), the branches are disjoint, and they
 * select what `seekPredicate` does. Predicates are evaluated with SQL's
 * three-valued logic, so a comparison with a null holds for no row.
 */
import type { SortDirection } from '../definition/types';
import type { ColumnTarget, CursorValue, Predicate } from './types';

import { describe, expect, it } from 'vitest';

import { seekBranches, seekPredicate } from './seek';

type Row = Readonly<Record<string, CursorValue>>;
type Side = 'after' | 'before';

interface Key {
  readonly target: ColumnTarget;
  readonly direction: SortDirection;
  readonly nullable: boolean;
}

function key(column: string, direction: SortDirection, nullable = false): Key {
  return {
    target: { kind: 'column', table: 't', column, type: 'text', lower: false },
    direction,
    nullable,
  };
}

/** SQL's three-valued result of `node` on `row`: `null` is unknown. */
function evaluate(node: Predicate, row: Row): boolean | null {
  switch (node.kind) {
    case 'and': {
      const results = new Set(node.items.map((item) => evaluate(item, row)));
      if (results.has(false)) return false;
      return results.has(null) ? null : true;
    }
    case 'or': {
      const results = new Set(node.items.map((item) => evaluate(item, row)));
      if (results.has(true)) return true;
      return results.has(null) ? null : false;
    }
    case 'literal':
      return node.value;
    case 'null': {
      const absent = row[(node.target as ColumnTarget).column] === null;
      return node.negate ? !absent : absent;
    }
    case 'compare': {
      const value = row[(node.target as ColumnTarget).column];
      if (value === null || value === undefined) return null;
      const order = value.localeCompare(String(node.value));
      const holds = {
        '=': order === 0,
        '!=': order !== 0,
        '>': order > 0,
        '>=': order >= 0,
        '<': order < 0,
        '<=': order <= 0,
      };
      return holds[node.operator];
    }
    case 'not':
    case 'in':
    case 'between':
    case 'like':
    case 'array':
    case 'exists':
    case 'textSearch':
      break;
  }
  throw new TypeError(`a seek holds no ${node.kind} node`);
}

/** The total order of the sort: each key in its direction, nulls last in both. */
function compareRows(keys: ReadonlyArray<Key>, a: Row, b: Row): number {
  for (const { target, direction } of keys) {
    const [x, y] = [a[target.column] ?? null, b[target.column] ?? null];
    if (x === y) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    const order = x.localeCompare(y);
    return direction === 'asc' ? order : -order;
  }
  return 0;
}

/** Every combination of the domains, each row with its own `id`. */
function grid(
  domains: Readonly<Record<string, ReadonlyArray<CursorValue>>>,
): Array<Row> {
  let rows: Array<Record<string, CursorValue>> = [{}];
  for (const [column, values] of Object.entries(domains)) {
    rows = rows.flatMap((row) =>
      values.map((value) => Object.assign({}, row, { [column]: value })),
    );
  }
  for (const [index, row] of rows.entries()) {
    row['id'] = String(index).padStart(3, '0');
  }
  return rows;
}

/** Checks every cursor of `rows` on both sides; returns the cursors checked. */
function holdToOracle(
  keys: ReadonlyArray<Key>,
  rows: ReadonlyArray<Row>,
): number {
  let checked = 0;
  for (const cursor of rows) {
    const values = keys.map(({ target }) => cursor[target.column] ?? null);
    for (const side of [
      'after',
      'before',
    ] as const satisfies ReadonlyArray<Side>) {
      const past = (row: Row) => {
        const order = compareRows(keys, row, cursor);
        return side === 'after' ? order > 0 : order < 0;
      };
      const branches = seekBranches(keys, values, side);
      const predicate = seekPredicate(keys, values, side);
      for (const row of rows) {
        const holding = branches.filter(
          (branch) => evaluate(branch, row) === true,
        );
        expect(
          holding.length,
          `${side} ${JSON.stringify(cursor)}: ${JSON.stringify(row)}`,
        ).toBe(past(row) ? 1 : 0);
        expect(evaluate(predicate, row) === true).toBe(past(row));
      }
      checked += 1;
    }
  }
  return checked;
}

describe('seekBranches against the order it pages through', () => {
  it('a nullable first key in both directions, then a key that is not nullable, then the key', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const keys = [
        key('a', direction, true),
        key('b', 'desc'),
        key('id', 'asc'),
      ];
      const rows = grid({
        a: [null, '1', '2', '3'],
        b: ['1', '2'],
        c: ['x', 'y'],
      });
      expect(holdToOracle(keys, rows)).toBe(2 * rows.length);
    }
  });

  it('two nullable keys of mixed directions, ties on both', () => {
    const keys = [
      key('a', 'desc', true),
      key('b', 'asc', true),
      key('id', 'desc'),
    ];
    const rows = grid({
      a: [null, '1', '2'],
      b: [null, '1', '2'],
      c: ['x', 'y', 'z'],
    });
    expect(holdToOracle(keys, rows)).toBe(2 * rows.length);
  });

  it('a cursor no row can follow, after a null on its last key, is the one branch false', () => {
    expect(seekBranches([key('a', 'asc', true)], [null], 'after')).toEqual([
      { kind: 'literal', value: false },
    ]);
  });

  it('the key alone', () => {
    const rows = grid({ c: ['x', 'y', 'z', 'w'] });
    expect(holdToOracle([key('id', 'desc')], rows)).toBe(2 * rows.length);
  });
});
