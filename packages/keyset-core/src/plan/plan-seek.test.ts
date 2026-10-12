/**
 * The plan's seek (SPEC 6.1 step 7, ADR 0020): one branch per key past
 * the cursor, the nulls of a nullable key apart; one branch, the
 * predicate, when the first key is an aggregate; and a range's branches
 * each bounded by the predicate of its `before` cursor.
 */
import { describe, expect, it } from 'vitest';

import { createCursorCodec } from '../cursor/codec';
import { definition, SECRET } from '../test-support/fixtures';
import { createPlanner } from './plan';

const codec = createCursorCodec({ secret: SECRET });
const plan = createPlanner(definition, codec);

function compare(target: unknown, operator: string, value: string) {
  return { kind: 'compare', target, operator, value };
}

function isNull(target: unknown, negate = false) {
  return { kind: 'null', target, negate };
}

/** The plan of the page after `values` on `sort`, and before `until` when given. */
async function planPast(
  sort: ReadonlyArray<string>,
  values: ReadonlyArray<string | null>,
  until?: ReadonlyArray<string | null>,
) {
  const first = await plan({ sort });
  const after = await codec.encode(values, first.context);
  const before =
    until === undefined ? undefined : await codec.encode(until, first.context);
  return plan({ sort, page: { after, before } });
}

describe('the seek of a plan', () => {
  it('after a value of a nullable first key: its greater values, its nulls, then the rest of its tie', async () => {
    const next = await planPast(['age'], ['30', 'k1']);
    const [age, id] = next.keys.map((key) => key.target);
    expect(next.seek).toEqual([
      compare(age, '>', '30'),
      isNull(age),
      { kind: 'and', items: [compare(age, '=', '30'), compare(id, '>', 'k1')] },
    ]);
  });

  it('after a null of a nullable first key: only the rest of the nulls', async () => {
    const next = await planPast(['-age'], [null, 'k1']);
    const [age, id] = next.keys.map((key) => key.target);
    expect(next.seek).toEqual([
      { kind: 'and', items: [isNull(age), compare(id, '>', 'k1')] },
    ]);
  });

  it('keeps the predicate as one branch when the first key is an aggregate, which no index holds', async () => {
    const next = await planPast(['-emailCount'], ['3', 'k1']);
    const [count, id] = next.keys.map((key) => key.target);
    expect(count).toMatchObject({ kind: 'aggregate' });
    expect(next.seek).toEqual([
      {
        kind: 'and',
        items: [
          compare(count, '<=', '3'),
          {
            kind: 'or',
            items: [
              compare(count, '<', '3'),
              {
                kind: 'and',
                items: [compare(count, '=', '3'), compare(id, '>', 'k1')],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('bounds each branch of a range by the predicate of its before cursor', async () => {
    const range = await planPast(
      ['-createdAt'],
      ['2024-03', 'k1'],
      ['2024-01', 'k9'],
    );
    const [createdAt, id] = range.keys.map((key) => key.target);
    const end = {
      kind: 'and',
      items: [
        compare(createdAt, '>=', '2024-01'),
        {
          kind: 'or',
          items: [
            compare(createdAt, '>', '2024-01'),
            {
              kind: 'and',
              items: [
                compare(createdAt, '=', '2024-01'),
                compare(id, '<', 'k9'),
              ],
            },
          ],
        },
      ],
    };
    expect(range.seek).toEqual([
      { kind: 'and', items: [compare(createdAt, '<', '2024-03'), end] },
      {
        kind: 'and',
        items: [
          {
            kind: 'and',
            items: [compare(createdAt, '=', '2024-03'), compare(id, '>', 'k1')],
          },
          end,
        ],
      },
    ]);
  });

  it('names each key value alias keysetNv', async () => {
    const first = await plan({ sort: ['status', '-createdAt'] });
    expect(first.keys.map((key) => [key.alias, key.valueAlias])).toEqual([
      ['keyset0', 'keyset0v'],
      ['keyset1', 'keyset1v'],
      ['keyset2', 'keyset2v'],
    ]);
  });
});
