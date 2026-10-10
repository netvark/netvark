/**
 * Every document the builders produce validates against the JSON:API
 * response schema (with the 1.1 members added). Structural drift in a
 * builder fails here even when the unit tests of the builder still pass.
 */
import { describe, expect, it } from 'vitest';

import {
  errorDocument,
  errorItem,
  jsonApiError,
} from '../errors/json-api-error';
import { paginatedDocument } from '../pagination/paginated';
import { parseQuery } from '../query/parse-query';
import { defineResource } from '../resource/define-resource';
import { schemaErrors } from '../test-support/conformance';
import {
  collectionDocument,
  include,
  resourceDocument,
  toManyRelationshipDocument,
  toOneRelationshipDocument,
} from './build';

interface PersonRow {
  readonly id: string;
  readonly name: string;
}

interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  links: { self: (id) => `https://api.test/people/${id}` },
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title },
    relationships: { author: row.authorId, tags: row.tagIds },
    meta: { revision: 2 },
  }),
  links: {
    self: (id) => `https://api.test/articles/${id}`,
    relationship: (id, name) => ({
      self: `https://api.test/articles/${id}/relationships/${name}`,
      related: `https://api.test/articles/${id}/${name}`,
    }),
  },
  query: { include: ['author'], page: { max: 10 }, sort: ['title'] },
});

const author: PersonRow = { id: '9', name: 'Dan' };
const article: ArticleRow = {
  id: '1',
  title: 'Hi',
  authorId: '9',
  tagIds: ['t1'],
};

describe('schema conformance', () => {
  it('resource and collection documents with included resources', () => {
    const query = parseQuery(Articles, 'include=author&fields[people]=name');
    expect(
      schemaErrors(
        resourceDocument(Articles, article, {
          query,
          included: [include(People, [author])],
          links: { self: 'https://api.test/articles/1' },
          jsonapi: { version: '1.1' },
          meta: { requestId: 'r' },
        }),
      ),
    ).toEqual([]);
    expect(
      schemaErrors(
        collectionDocument(Articles, [article], {
          query,
          included: [include(People, [author])],
        }),
      ),
    ).toEqual([]);
    expect(schemaErrors(resourceDocument(Articles, null))).toEqual([]);
  });

  it('relationship documents', () => {
    expect(
      schemaErrors(
        toOneRelationshipDocument(People, author, {
          links: {
            self: 'https://api.test/articles/1/relationships/author',
            related: 'https://api.test/articles/1/author',
          },
        }),
      ),
    ).toEqual([]);
    expect(schemaErrors(toOneRelationshipDocument(People, null))).toEqual([]);
    expect(schemaErrors(toManyRelationshipDocument(People, [author]))).toEqual(
      [],
    );
  });

  it('paginated documents with the profile applied', () => {
    const url = 'https://api.test/articles?page[size]=1&sort=title';
    expect(
      schemaErrors(
        paginatedDocument(
          Articles,
          {
            rows: [article],
            next: 'c2',
            prev: null,
            total: 5,
            cursor: () => 'c1',
          },
          { url, query: parseQuery(Articles, 'page[size]=1&sort=title') },
        ),
      ),
    ).toEqual([]);
  });

  it('error documents for every catalog factory', () => {
    const documents = [
      errorDocument(
        jsonApiError('INVALID_QUERY_PARAMETER', {
          detail: 'bad',
          source: { parameter: 'sort' },
        }),
      ),
      errorDocument(
        jsonApiError('INVALID_DOCUMENT', {
          detail: 'bad',
          source: { pointer: '/data' },
        }),
        { jsonapi: { version: '1.1' } },
      ),
      errorDocument(jsonApiError('MALFORMED_JSON')),
      errorDocument(jsonApiError('FORBIDDEN', { detail: 'no' })),
      errorDocument(jsonApiError('NOT_FOUND')),
      errorDocument(
        jsonApiError('NOT_ACCEPTABLE', {
          detail: 'no',
          source: { header: 'Accept' },
        }),
      ),
      errorDocument(
        jsonApiError('MAX_PAGE_SIZE_EXCEEDED', {
          detail: 'no',
          source: { parameter: 'page[size]' },
          meta: { page: { maxSize: 10 } },
        }),
      ),
      errorDocument(
        jsonApiError([
          errorItem('VALIDATION_FAILED', {
            detail: 'Required',
            source: { pointer: '/data/attributes/title' },
          }),
          errorItem('CONFLICT', {
            detail: 'taken',
            source: { pointer: '/data/id' },
          }),
        ]),
      ),
      errorDocument(jsonApiError('INTERNAL_SERVER_ERROR', { detail: 'x' })),
    ];
    for (const document of documents) {
      expect(schemaErrors(document), JSON.stringify(document)).toEqual([]);
    }
  });

  it('rejects what the schema should reject, so the check is live', () => {
    expect(schemaErrors({ data: { type: 'a' } })).not.toEqual([]);
    expect(schemaErrors({ meta: {}, included: [] })).not.toEqual([]);
    expect(schemaErrors({})).not.toEqual([]);
  });
});
