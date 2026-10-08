import type { Row } from './test-fixtures';

import { describe, expect, it } from 'vitest';

import { defineResource } from '../resource/define-resource';
import { parseQuery } from './parse-query';
import { Articles, Companies, People, errorsOf } from './test-fixtures';

describe('parseQuery inputs', () => {
  it('accepts a query string, URLSearchParams, and a Hono-style record alike', () => {
    const expected = parseQuery(Articles, 'sort=-title&fields[articles]=title');
    expect(
      parseQuery(Articles, '?sort=-title&fields%5Barticles%5D=title'),
    ).toEqual(expected);
    expect(
      parseQuery(
        Articles,
        new URLSearchParams('sort=-title&fields[articles]=title'),
      ),
    ).toEqual(expected);
    expect(
      parseQuery(Articles, { sort: '-title', 'fields[articles]': 'title' }),
    ).toEqual(expected);
    expect(expected.params.toString()).toBe(
      'sort=-title&fields%5Barticles%5D=title',
    );
  });

  it('returns the empty query for no parameters, with pagination defaults', () => {
    expect(parseQuery(Articles, '')).toEqual({
      include: undefined,
      fields: {},
      sort: [],
      filter: { conditions: [], anyOf: [] },
      page: {
        size: 10,
        after: undefined,
        before: undefined,
        sizeRequested: false,
        range: false,
      },
      search: undefined,
      custom: {},
      params: new URLSearchParams(),
    });
    expect(parseQuery(People, '').page).toBeUndefined();
  });
});

describe('unknown and malformed parameters', () => {
  it('rejects every parameter the endpoint cannot process, with source.parameter', () => {
    const errors = errorsOf(
      'foo=1&page[number]=2&filter=x&sort[x]=1&include[a]=b&fields=x&ext:x=1',
    );
    expect(errors.map((error) => error.source?.parameter)).toEqual([
      'foo',
      'page[number]',
      'filter',
      'sort[x]',
      'include[a]',
      'fields',
      'ext:x',
    ]);
    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(['UNKNOWN_QUERY_PARAMETER']),
    );
  });

  it('rejects prototype-key and malformed family names without touching Object.prototype', () => {
    const errors = errorsOf(
      '__proto__[polluted]=1&constructor[prototype][x]=1&filter[[title]]=x',
    );
    expect(errors).toHaveLength(3);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('rejects a repeated single-valued parameter', () => {
    expect(errorsOf('sort=title&sort=body')[0]).toMatchObject({
      code: 'INVALID_QUERY_PARAMETER',
      detail: 'Query parameter "sort" is specified more than once',
      source: { parameter: 'sort' },
    });
    expect(errorsOf('page[size]=1&page[size]=2')[0]?.source).toEqual({
      parameter: 'page[size]',
    });
    expect(errorsOf('filter[q]=a&filter[q]=b')[0]?.source).toEqual({
      parameter: 'filter[q]',
    });
  });
});

describe('include', () => {
  it('resolves declared paths and their prefixes, deduplicated', () => {
    expect(
      parseQuery(Articles, 'include=author,comments.author,comments,author')
        .include,
    ).toEqual([['author'], ['comments', 'author'], ['comments']]);
    expect(
      parseQuery(Articles, 'include=comments.author.company').include,
    ).toEqual([['comments', 'author', 'company']]);
  });

  it('distinguishes an absent include from an empty one', () => {
    expect(parseQuery(Articles, '').include).toBeUndefined();
    expect(parseQuery(Articles, 'include=').include).toEqual([]);
  });

  it('rejects undeclared and malformed paths', () => {
    const errors = errorsOf(
      'include=tags,comments.author.company.x,author..company, author',
    );
    expect(errors.map((error) => error.detail)).toEqual([
      'Relationship path "tags" is not supported by this endpoint',
      'Relationship path "comments.author.company.x" is not supported by this endpoint',
      '"author..company" is not a relationship path',
      '" author" is not a relationship path',
    ]);
    expect(errors.every((error) => error.source?.parameter === 'include')).toBe(
      true,
    );
  });

  it('rejects include on an endpoint that declares none', () => {
    expect(errorsOf('include=author', Companies)[0]?.detail).toContain(
      'not supported',
    );
  });
});

describe('fields', () => {
  it('accepts declared fields of every reachable type and empties', () => {
    const query = parseQuery(
      Articles,
      'fields[articles]=title,author,title&fields[people]=name&fields[companies]=&fields[comments]=body',
    );
    expect(query.fields).toEqual({
      articles: ['title', 'author'],
      people: ['name'],
      companies: [],
      comments: ['body'],
    });
  });

  it('rejects unknown types, unknown fields, type and id, and repeats', () => {
    const errors = errorsOf(
      'fields[tags]=name&fields[articles]=title,nope,id&fields[people]=a&fields[people]=b',
    );
    expect(
      errors.map((error) => [error.source?.parameter, error.detail]),
    ).toEqual([
      [
        'fields[tags]',
        'Resource type "tags" does not appear in responses from this endpoint',
      ],
      ['fields[articles]', '"nope" is not a field of "articles"'],
      ['fields[articles]', '"id" is not a field of "articles"'],
      [
        'fields[people]',
        'Query parameter "fields[people]" is specified more than once',
      ],
    ]);
  });

  it('rejects fields when the definition turns sparse fieldsets off', () => {
    const NoFields = defineResource({
      type: 'logs',
      attributes: ['line'],
      serialize: (row: Row) => ({ id: row.id }),
      query: { fields: false },
    });
    expect(errorsOf('fields[logs]=line', NoFields)[0]?.code).toBe(
      'UNKNOWN_QUERY_PARAMETER',
    );
  });
});
