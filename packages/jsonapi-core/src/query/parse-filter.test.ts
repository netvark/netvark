import type { Row } from './test-fixtures';

import { describe, expect, it } from 'vitest';

import { defineResource } from '../resource/define-resource';
import { parseQuery } from './parse-query';
import { Articles, People, errorsOf } from './test-fixtures';

describe('filter', () => {
  it('parses conditions, operators, repeated values, or-groups, and search, each condition with the parameter it came in', () => {
    const query = parseQuery(
      Articles,
      'filter[title]=a&filter[title][like]=b%25&filter[created][gt]=1&filter[created][gt]=2' +
        '&filter[or][1][title]=x&filter[or][0][author.name][eq]=y&filter[or][1][created][lt]=z&filter[q]=hello',
    );
    expect(query.filter).toEqual({
      conditions: [
        {
          field: 'title',
          operator: 'eq',
          value: 'a',
          parameter: 'filter[title]',
        },
        {
          field: 'title',
          operator: 'like',
          value: 'b%',
          parameter: 'filter[title][like]',
        },
        {
          field: 'created',
          operator: 'gt',
          value: ['1', '2'],
          parameter: 'filter[created][gt]',
        },
      ],
      anyOf: [
        [
          {
            field: 'author.name',
            operator: 'eq',
            value: 'y',
            parameter: 'filter[or][0][author.name][eq]',
          },
        ],
        [
          {
            field: 'title',
            operator: 'eq',
            value: 'x',
            parameter: 'filter[or][1][title]',
          },
          {
            field: 'created',
            operator: 'lt',
            value: 'z',
            parameter: 'filter[or][1][created][lt]',
          },
        ],
      ],
    });
    expect(query.search).toBe('hello');
  });

  it('rejects undeclared fields, operators, and malformed members', () => {
    const errors = errorsOf(
      'filter[body]=x&filter[title][gt]=1&filter[or][x][title]=1&filter[or][0]=1&filter[title][eq][x]=1&filter[q][x]=1&filter[]=1&filter[or][0][nope]=1',
    );
    expect(
      errors.map((error) => [error.code, error.source?.parameter]),
    ).toEqual([
      ['INVALID_QUERY_PARAMETER', 'filter[body]'],
      ['INVALID_QUERY_PARAMETER', 'filter[title][gt]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[or][x][title]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[or][0]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[title][eq][x]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[q][x]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[]'],
      ['INVALID_QUERY_PARAMETER', 'filter[or][0][nope]'],
    ]);
    expect(errors[0]?.detail).toBe(
      'Filter field "body" is not supported by this endpoint',
    );
    expect(errors[1]?.detail).toBe(
      'Operator "gt" is not supported for filter field "title"',
    );
  });

  it('does not treat the search member as a filter field when search is undeclared', () => {
    expect(errorsOf('filter[q]=x', People)[0]?.detail).toBe(
      'Filter field "q" is not supported by this endpoint',
    );
  });
});

describe('prototype keys from the client', () => {
  it('treats a field named after a prototype member as an undeclared field, never as a lookup', () => {
    const errors = errorsOf(
      'filter[constructor]=1&filter[toString][eq]=2&filter[__proto__]=3',
    );
    expect(
      errors.map((error) => [error.code, error.source?.parameter]),
    ).toEqual([
      ['INVALID_QUERY_PARAMETER', 'filter[constructor]'],
      ['INVALID_QUERY_PARAMETER', 'filter[toString][eq]'],
      ['UNKNOWN_QUERY_PARAMETER', 'filter[__proto__]'],
    ]);
  });
});

describe('custom and search parameters', () => {
  it('keeps custom parameters by full name and reads a custom search base', () => {
    expect(
      parseQuery(Articles, 'viewAs=admin&viewAs[x]=1&viewAs=user').custom,
    ).toEqual({
      viewAs: ['admin', 'user'],
      'viewAs[x]': '1',
    });
    const Searchable = defineResource({
      type: 'docs',
      attributes: ['text'],
      serialize: (row: Row) => ({ id: row.id }),
      query: { search: 'searchText' },
    });
    expect(parseQuery(Searchable, 'searchText=hi').search).toBe('hi');
    expect(errorsOf('searchText[x]=hi', Searchable)[0]?.code).toBe(
      'UNKNOWN_QUERY_PARAMETER',
    );
  });
});

describe('definition mistakes surface as TypeError on first parse', () => {
  it('reports an include path through a relationship without a definition', () => {
    const Broken = defineResource({
      type: 'broken',
      attributes: ['x'],
      relationships: { tags: { type: 'tags', cardinality: 'many' } },
      serialize: (row: Row) => ({ id: row.id }),
      query: { include: ['tags'] },
    });
    expect(() => parseQuery(Broken, '')).toThrow(
      /declares no resource definition/u,
    );
  });

  it('reports two definitions sharing a type', () => {
    const OtherPeople = defineResource({
      type: 'people',
      attributes: ['name'],
      serialize: (row: Row) => ({ id: row.id }),
    });
    const Mixed = defineResource({
      type: 'mixed',
      attributes: ['x'],
      relationships: {
        a: { type: 'people', cardinality: 'one', resource: () => People },
        b: { type: 'people', cardinality: 'one', resource: () => OtherPeople },
      },
      serialize: (row: Row) => ({ id: row.id }),
      query: { include: ['a', 'b'] },
    });
    expect(() => parseQuery(Mixed, '')).toThrow(
      /two different definitions declare the type "people"/u,
    );
  });
});
