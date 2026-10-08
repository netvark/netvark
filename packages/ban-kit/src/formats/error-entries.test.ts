import type { ErrorItem } from '../core/error-item';

import { describe, expect, it } from 'vitest';

import { readLocation, toErrorEntries } from './error-entries';

describe('readLocation', () => {
  it('reads a valid location from meta and nothing otherwise', () => {
    expect(readLocation({ location: 'query' })).toBe('query');
    expect(readLocation({ location: 'nope' })).toBeUndefined();
    expect(readLocation({})).toBeUndefined();
  });
});

describe('toErrorEntries', () => {
  const item: ErrorItem = { detail: 'Required', path: ['items', 0, 'sku'] };
  const items = [item];

  it('uses pointers for body and form, names otherwise', () => {
    expect(toErrorEntries(items, 'body')).toEqual([
      { location: 'body', pointer: '/items/0/sku', detail: 'Required' },
    ]);
    expect(toErrorEntries(items, 'form')[0]?.pointer).toBe('/items/0/sku');
    expect(toErrorEntries(items, 'query')).toEqual([
      { location: 'query', name: 'items', detail: 'Required' },
    ]);
  });

  it('prefers the item location over the fallback and defaults to a pointer', () => {
    expect(toErrorEntries([{ ...item, location: 'header' }], 'body')).toEqual([
      { location: 'header', name: 'items', detail: 'Required' },
    ]);
    expect(toErrorEntries(items)).toEqual([
      { pointer: '/items/0/sku', detail: 'Required' },
    ]);
  });

  it('renders neither pointer nor name for an item without a path', () => {
    expect(toErrorEntries([{ detail: 'Whole request' }], 'body')).toEqual([
      { location: 'body', detail: 'Whole request' },
    ]);
  });

  it('includes reason as code, expected, and received only when present', () => {
    const [entry] = toErrorEntries(
      [
        {
          path: ['a'],
          detail: 'm',
          reason: 'invalid_type',
          expected: 'string',
          received: 'number',
          code: 'IGNORED',
          status: 404,
        },
      ],
      'header',
    );
    expect(entry).toEqual({
      location: 'header',
      name: 'a',
      detail: 'm',
      code: 'invalid_type',
      expected: 'string',
      received: 'number',
    });
  });
});
