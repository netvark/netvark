/**
 * Every document the builders produce validates against the JSON:API
 * response schema (with the 1.1 members added). Structural drift in a
 * builder fails here even when the unit tests of the builder still pass.
 */
import { describe, expect, it } from 'vitest';

import { JsonApiError } from '../errors/json-api-error';
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
      JsonApiError.invalidParameter('sort', 'bad').document(),
      JsonApiError.unknownParameter('x').document(),
      JsonApiError.invalidDocument('/data', 'bad').document({
        jsonapi: { version: '1.1' },
      }),
      JsonApiError.malformedJson().document(),
      JsonApiError.forbidden('no').document(),
      JsonApiError.clientGeneratedIdNotSupported().document(),
      JsonApiError.notFound().document(),
      JsonApiError.notAcceptable('no').document(),
      JsonApiError.conflict('taken', { pointer: '/data/id' }).document(),
      JsonApiError.unsupportedMediaType('no').document(),
      JsonApiError.validationFailed([
        { pointer: '/data/attributes/title', detail: 'Required' },
      ]).document(),
      JsonApiError.internal().document(),
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
