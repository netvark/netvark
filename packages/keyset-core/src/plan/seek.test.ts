import type { ColumnTarget, Predicate } from './types';

import { describe, expect, it } from 'vitest';

import { seekPredicate } from './seek';

const created: ColumnTarget = {
  kind: 'column',
  table: 'contacts',
  column: 'created_at',
  type: 'timestamptz',
  lower: false,
};
const name: ColumnTarget = {
  kind: 'column',
  table: 'contacts',
  column: 'name',
  type: 'text',
  lower: false,
};
const id: ColumnTarget = {
  kind: 'column',
  table: 'contacts',
  column: 'id',
  type: 'uuid',
  lower: false,
};

/** `created_at` is nullable; `name` and the key `id` are not. */
const createdAsc = {
  target: created,
  direction: 'asc',
  nullable: true,
} as const;
const createdDesc = {
  target: created,
  direction: 'desc',
  nullable: true,
} as const;
const nameAsc = { target: name, direction: 'asc', nullable: false } as const;
const nameDesc = { target: name, direction: 'desc', nullable: false } as const;
const idAsc = { target: id, direction: 'asc', nullable: false } as const;

function compare(
  target: ColumnTarget,
  operator: '=' | '>' | '>=' | '<' | '<=',
  value: string,
): Predicate {
  return { kind: 'compare', target, operator, value };
}

function isNull(target: ColumnTarget, negate = false): Predicate {
  return { kind: 'null', target, negate };
}

function and(...items: ReadonlyArray<Predicate>): Predicate {
  return { kind: 'and', items };
}

function or(...items: ReadonlyArray<Predicate>): Predicate {
  return { kind: 'or', items };
}

describe('seekPredicate over one key', () => {
  it('after a value of a nullable key: greater values and the nulls that sort last', () => {
    expect(seekPredicate([createdAsc], ['2024'], 'after')).toEqual(
      or(compare(created, '>', '2024'), isNull(created)),
    );
    expect(seekPredicate([createdDesc], ['2024'], 'after')).toEqual(
      or(compare(created, '<', '2024'), isNull(created)),
    );
  });

  it('after a value of a key that is not nullable: the comparison alone', () => {
    expect(seekPredicate([nameAsc], ['m'], 'after')).toEqual(
      compare(name, '>', 'm'),
    );
    expect(seekPredicate([nameDesc], ['m'], 'after')).toEqual(
      compare(name, '<', 'm'),
    );
  });

  it('before a value: the opposite comparison, never a null', () => {
    expect(seekPredicate([createdAsc], ['2024'], 'before')).toEqual(
      compare(created, '<', '2024'),
    );
    expect(seekPredicate([createdDesc], ['2024'], 'before')).toEqual(
      compare(created, '>', '2024'),
    );
  });

  it('without a key nothing lies beyond the cursor', () => {
    expect(seekPredicate([], [], 'after')).toEqual({
      kind: 'literal',
      value: false,
    });
  });

  it('after a null there is nothing on that key; before a null, every value', () => {
    expect(seekPredicate([createdAsc], [null], 'after')).toEqual({
      kind: 'literal',
      value: false,
    });
    expect(seekPredicate([createdAsc], [null], 'before')).toEqual(
      isNull(created, true),
    );
  });
});

describe('seekPredicate over several keys', () => {
  it('leads with a range on a first key that is not nullable, after and before', () => {
    expect(seekPredicate([nameAsc, idAsc], ['m', 'k'], 'after')).toEqual(
      and(
        compare(name, '>=', 'm'),
        or(
          compare(name, '>', 'm'),
          and(compare(name, '=', 'm'), compare(id, '>', 'k')),
        ),
      ),
    );
    expect(seekPredicate([nameDesc, idAsc], ['m', 'k'], 'after')).toEqual(
      and(
        compare(name, '<=', 'm'),
        or(
          compare(name, '<', 'm'),
          and(compare(name, '=', 'm'), compare(id, '>', 'k')),
        ),
      ),
    );
    expect(seekPredicate([nameAsc, idAsc], ['m', 'k'], 'before')).toEqual(
      and(
        compare(name, '<=', 'm'),
        or(
          compare(name, '<', 'm'),
          and(compare(name, '=', 'm'), compare(id, '<', 'k')),
        ),
      ),
    );
    expect(seekPredicate([nameDesc, idAsc], ['m', 'k'], 'before')).toEqual(
      and(
        compare(name, '>=', 'm'),
        or(
          compare(name, '>', 'm'),
          and(compare(name, '=', 'm'), compare(id, '<', 'k')),
        ),
      ),
    );
  });

  it('after a value of a nullable first key, no range holds the nulls, so none leads', () => {
    expect(seekPredicate([createdDesc, idAsc], ['2024', 'k'], 'after')).toEqual(
      or(
        or(compare(created, '<', '2024'), isNull(created)),
        and(compare(created, '=', '2024'), compare(id, '>', 'k')),
      ),
    );
  });

  it('before a value of a nullable first key, the range leads, since no null sorts before a value', () => {
    expect(seekPredicate([createdAsc, idAsc], ['2024', 'k'], 'before')).toEqual(
      and(
        compare(created, '<=', '2024'),
        or(
          compare(created, '<', '2024'),
          and(compare(created, '=', '2024'), compare(id, '<', 'k')),
        ),
      ),
    );
  });

  it('after a null, the nulls lead and the null prefix continues inside them', () => {
    expect(seekPredicate([createdAsc, idAsc], [null, 'k'], 'after')).toEqual(
      and(
        isNull(created),
        or(
          { kind: 'literal', value: false },
          and(isNull(created), compare(id, '>', 'k')),
        ),
      ),
    );
  });

  it('before a null, every value of the first key may lie before it, so nothing leads', () => {
    expect(seekPredicate([createdAsc, idAsc], [null, 'k'], 'before')).toEqual(
      or(isNull(created, true), and(isNull(created), compare(id, '<', 'k'))),
    );
  });
});
