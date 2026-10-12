import { describe, expect, it } from 'vitest';

import {
  invalidPath,
  invalidValues,
  unsupported,
} from '../test-support/filter';
import { definition } from '../test-support/fixtures';
import { normalizeFilter } from './normalize';

/** A condition whose value `age`, an integer field, refuses. */
const OLD = { field: 'age', op: 'gte', value: 'old' } as const;

describe('normalizeFilter: refused values (ADR 0019)', () => {
  it('lists every refused condition in the order of the request, at any depth', () => {
    expect(
      invalidValues(() =>
        normalizeFilter(definition, {
          and: [
            OLD,
            { field: 'firstName', op: 'eq', value: 'Ada' },
            {
              or: [
                { not: { field: 'createdAt', op: 'lt', value: 'yesterday' } },
                { field: 'emails.primary', op: 'eq', value: 'sometimes' },
              ],
            },
            {
              relation: 'emails',
              some: { field: 'email', op: 'contains', value: 3 },
            },
            { field: 'status', op: 'eq', value: 'gone' },
          ],
        }),
      ),
    ).toEqual([
      { field: 'age', operator: 'gte', expected: 'integer' },
      {
        field: 'createdAt',
        operator: 'lt',
        expected: 'timestamptz (ISO 8601)',
      },
      { field: 'emails.primary', operator: 'eq', expected: 'boolean' },
      { field: 'email', operator: 'contains', expected: 'text' },
      {
        field: 'status',
        operator: 'eq',
        expected: 'one of "lead", "customer"',
      },
    ]);
  });

  it('lists a condition once, however many of its items are refused', () => {
    expect(
      invalidValues(() =>
        normalizeFilter(definition, {
          or: [
            { field: 'age', op: 'in', value: ['x', 1, 'y'] },
            { field: 'age', op: 'between', value: [1] },
          ],
        }),
      ),
    ).toEqual([
      { field: 'age', operator: 'in', expected: 'integer' },
      { field: 'age', operator: 'between', expected: '[low, high]' },
    ]);
  });

  it('reports a structural problem alone, wherever it is in the tree', () => {
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          and: [OLD, { field: 'nope', op: 'eq', value: 1 }],
        }),
      ),
    ).toEqual({ field: 'nope', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          and: [{ field: 'age', op: 'contains', value: 'x' }, OLD],
        }),
      ),
    ).toEqual({ field: 'age', operator: 'contains' });
    expect(
      invalidPath(() =>
        normalizeFilter(definition, { and: [OLD, { or: 'x' }] } as never),
      ),
    ).toEqual(['and', 1]);
  });
});
