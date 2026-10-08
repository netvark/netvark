import { describe, expect, it } from 'vitest';

import { itemFromIssue, itemsFromIssues } from './error-item';

describe('itemFromIssue', () => {
  it('keeps the message as detail, the code as reason, and the location', () => {
    expect(
      itemFromIssue(
        {
          path: ['items', 0, 'sku'],
          message: 'Required',
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
        },
        'body',
      ),
    ).toEqual({
      detail: 'Required',
      location: 'body',
      path: ['items', 0, 'sku'],
      reason: 'invalid_type',
      expected: 'string',
      received: 'undefined',
    });
  });

  it('omits the optional members the issue lacks', () => {
    expect(itemFromIssue({ path: [], message: 'm' }, 'query')).toEqual({
      detail: 'm',
      location: 'query',
      path: [],
    });
  });
});

describe('itemsFromIssues', () => {
  it('maps every issue', () => {
    expect(
      itemsFromIssues(
        [
          { path: ['a'], message: 'x' },
          { path: ['b'], message: 'y' },
        ],
        'header',
      ).map((item) => item.path),
    ).toEqual([['a'], ['b']]);
  });
});
