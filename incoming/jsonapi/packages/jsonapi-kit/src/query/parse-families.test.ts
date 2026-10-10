import type { Row } from './test-fixtures';

import { describe, expect, it } from 'vitest';

import { defineResource } from '../resource/define-resource';
import { parseQuery } from './parse-query';
import { Articles, People, errorsOf } from './test-fixtures';

describe('sort', () => {
  it('parses direction prefixes in order', () => {
    expect(
      parseQuery(Articles, 'sort=-created,title,author.name').sort,
    ).toEqual([
      { field: 'created', direction: 'desc' },
      { field: 'title', direction: 'asc' },
      { field: 'author.name', direction: 'asc' },
    ]);
    expect(parseQuery(Articles, 'sort=').sort).toEqual([]);
  });

  it('reports unsupported fields with the profile type link and repeats', () => {
    const errors = errorsOf('sort=body,-title,title,--created');
    expect(errors[0]).toEqual({
      id: expect.any(String),
      links: {
        type: 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort',
      },
      status: '400',
      code: 'UNSUPPORTED_SORT',
      title: 'Unsupported Sort',
      detail: 'Sort field "body" is not supported by this endpoint',
      source: { parameter: 'sort' },
      meta: { location: 'query' },
    });
    expect(errors[1]?.detail).toBe('Sort field "title" is repeated');
    expect(errors[2]?.detail).toBe(
      'Sort field "-created" is not supported by this endpoint',
    );
  });
});

describe('page', () => {
  it('uses the requested size or the default, and the max on range requests', () => {
    expect(parseQuery(Articles, 'page[size]=7&page[after]=abc').page).toEqual({
      size: 7,
      after: 'abc',
      before: undefined,
      sizeRequested: true,
      range: false,
    });
    expect(parseQuery(Articles, 'page[before]=xyz').page).toMatchObject({
      size: 10,
      before: 'xyz',
    });
    expect(parseQuery(Articles, 'page[after]=a&page[before]=b').page).toEqual({
      size: 50,
      after: 'a',
      before: 'b',
      sizeRequested: false,
      range: true,
    });
    expect(parseQuery(Articles, 'page[size]=50').page?.size).toBe(50);
  });

  it('rejects sizes outside ^[0-9]+$ or zero as invalid parameters', () => {
    for (const size of [
      '0',
      '-1',
      '1.5',
      '1e2',
      '0x10',
      '+7',
      ' 5',
      '',
      'abc',
      '00',
    ]) {
      const [error] = errorsOf(`page[size]=${encodeURIComponent(size)}`);
      if (size === '00') {
        expect(error?.code).toBe('INVALID_QUERY_PARAMETER');
        continue;
      }
      expect(error, size).toMatchObject({
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'page[size]' },
      });
    }
  });

  it('reports a size over the max with meta.page.maxSize and the type link', () => {
    expect(errorsOf('page[size]=51')[0]).toEqual({
      id: expect.any(String),
      links: {
        type: 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/max-size-exceeded',
      },
      status: '400',
      code: 'MAX_PAGE_SIZE_EXCEEDED',
      title: 'Max Page Size Exceeded',
      detail: 'page[size] 51 exceeds the maximum of 50',
      source: { parameter: 'page[size]' },
      meta: { page: { maxSize: 50 }, location: 'query' },
    });
  });

  it('rejects empty cursors and range requests where unsupported', () => {
    expect(errorsOf('page[after]=')[0]?.detail).toBe(
      'page[after] must be a cursor',
    );
    const NoRange = defineResource({
      type: 'events',
      attributes: ['at'],
      serialize: (row: Row) => ({ id: row.id }),
      query: { page: { max: 10 } },
    });
    expect(errorsOf('page[after]=a&page[before]=b', NoRange)[0]).toMatchObject({
      code: 'RANGE_PAGINATION_NOT_SUPPORTED',
      links: {
        type: 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/range-pagination-not-supported',
      },
    });
  });

  it('rejects every page parameter when the definition does not paginate', () => {
    expect(errorsOf('page[size]=1', People)[0]?.code).toBe(
      'UNKNOWN_QUERY_PARAMETER',
    );
  });
});
