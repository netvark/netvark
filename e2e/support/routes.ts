/**
 * The blog's routes: resources, relationships, and the two routes the
 * error tests need. Everything a handler does with a request or response
 * goes through the package.
 */
import type { Hono } from 'hono';

import type { Included, JsonApiEnv, ParsedQuery } from 'hono-jsonapi';

import type { PersonView } from './resources.ts';
import type { ArticleRow, PersonRow, Store } from './store.ts';

import {
  bodyValidator,
  collectionDocument,
  include,
  jsonApiError,
  paginatedDocument,
  queryValidator,
  relationshipValidator,
  resourceDocument,
  respond,
  toManyLinkage,
  toManyRelationshipDocument,
  toOneLinkage,
  toOneRelationshipDocument,
} from 'hono-jsonapi';

import { Articles, BASE_URL, People, Tags } from './resources.ts';
import { cursorOf } from './store.ts';

const TIMESTAMP = '2026-02-01T00:00:00Z';

function defined<T>(rows: ReadonlyArray<T | undefined>): Array<T> {
  return rows.filter((row): row is T => row !== undefined);
}

export function registerRoutes(app: Hono<JsonApiEnv>, store: Store): void {
  const view = (row: PersonRow): PersonView => ({
    ...row,
    articleIds: store.articlesOf(row.id).map((item) => item.id),
  });

  function article(id: string): ArticleRow {
    const row = store.articles.get(id);
    if (row === undefined) {
      throw jsonApiError('NOT_FOUND', {
        detail: `Article ${id} does not exist`,
      });
    }
    return row;
  }

  /** Only what the client asked for: full linkage rejects anything else. */
  function includedFor(
    rows: ReadonlyArray<ArticleRow>,
    query: ParsedQuery,
  ): Array<Included> {
    const paths = new Set((query.include ?? []).map((path) => path.join('.')));
    const out: Array<Included> = [];
    const authors = defined(
      [...new Set(rows.map((row) => row.authorId))].map((id) =>
        id === null ? undefined : store.people.get(id),
      ),
    );
    if (paths.has('author') || paths.has('author.articles')) {
      out.push(
        include(
          People,
          authors.map((row) => view(row)),
        ),
      );
    }
    if (paths.has('author.articles')) {
      out.push(
        include(
          Articles,
          authors.flatMap((author) => store.articlesOf(author.id)),
        ),
      );
    }
    if (paths.has('tags')) {
      const tags = defined(
        [...new Set(rows.flatMap((row) => row.tagIds))].map((id) =>
          store.tags.get(id),
        ),
      );
      out.push(include(Tags, tags));
    }
    return out;
  }

  app.get('/runtime', (c) => c.text(navigator.userAgent));

  app.get('/articles', queryValidator(Articles), (c) => {
    const query = c.req.valid('query');
    if (query.page === undefined) {
      throw new TypeError('articles always paginate');
    }
    const page = store.page({
      sort: query.sort,
      filter: query.filter,
      search: query.search,
      page: query.page,
    });
    return respond(
      c,
      paginatedDocument(
        Articles,
        { ...page, cursor: cursorOf },
        { url: c.req.url, query, included: includedFor(page.rows, query) },
      ),
    );
  });

  app.get('/articles/:id', queryValidator(Articles), (c) => {
    const query = c.req.valid('query');
    const row = article(c.req.param('id'));
    return respond(
      c,
      resourceDocument(Articles, row, {
        query,
        included: includedFor([row], query),
        links: { self: `${BASE_URL}/articles/${row.id}` },
      }),
    );
  });

  app.post(
    '/articles',
    bodyValidator(Articles, { operation: 'create' }),
    (c) => {
      const data = c.req.valid('json');
      const row: ArticleRow = {
        id: store.id(),
        title: data.attributes.title,
        body: data.attributes.body,
        createdAt: TIMESTAMP,
        authorId: toOneLinkage(data.relationships['author'])?.id ?? null,
        tagIds: (toManyLinkage(data.relationships['tags']) ?? []).map(
          (tag) => tag.id,
        ),
      };
      store.articles.set(row.id, row);
      return respond(c, resourceDocument(Articles, row), 201);
    },
  );

  app.patch(
    '/articles/:id',
    bodyValidator(Articles, { operation: 'update' }),
    (c) => {
      const data = c.req.valid('json');
      const current = article(c.req.param('id'));
      const row: ArticleRow = {
        ...current,
        title: data.attributes.title ?? current.title,
        body: data.attributes.body ?? current.body,
      };
      store.articles.set(row.id, row);
      return respond(c, resourceDocument(Articles, row));
    },
  );

  app.delete('/articles/:id', (c) => {
    article(c.req.param('id'));
    store.articles.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/articles/:id/relationships/author', (c) => {
    const row = article(c.req.param('id'));
    const author =
      row.authorId === null ? undefined : store.people.get(row.authorId);
    return respond(
      c,
      toOneRelationshipDocument(
        People,
        author === undefined ? null : view(author),
        {
          links: Articles.links.relationship?.(row.id, 'author'),
        },
      ),
    );
  });

  app.patch(
    '/articles/:id/relationships/author',
    relationshipValidator(Articles, 'author', 'one'),
    (c) => {
      const row = article(c.req.param('id'));
      store.articles.set(row.id, {
        ...row,
        authorId: c.req.valid('json')?.id ?? null,
      });
      return c.body(null, 204);
    },
  );

  app.get('/articles/:id/relationships/tags', (c) => {
    const row = article(c.req.param('id'));
    const tags = defined(row.tagIds.map((id) => store.tags.get(id)));
    return respond(c, toManyRelationshipDocument(Tags, tags));
  });

  app.on(
    ['POST', 'PATCH', 'DELETE'],
    '/articles/:id/relationships/tags',
    relationshipValidator(Articles, 'tags', 'many'),
    (c) => {
      const row = article(c.req.param('id'));
      const ids = c.req.valid('json').map((tag) => tag.id);
      const merged: Record<string, ReadonlyArray<string>> = {
        PATCH: ids,
        POST: [...new Set([...row.tagIds, ...ids])],
        DELETE: row.tagIds.filter((id) => !ids.includes(id)),
      };
      store.articles.set(row.id, {
        ...row,
        tagIds: merged[c.req.method] ?? row.tagIds,
      });
      return c.body(null, 204);
    },
  );

  app.get('/people', (c) =>
    respond(
      c,
      collectionDocument(
        People,
        [...store.people.values()].map((row) => view(row)),
      ),
    ),
  );

  app.get('/people/:id', (c) => {
    const row = store.people.get(c.req.param('id'));
    if (row === undefined) {
      throw jsonApiError('NOT_FOUND');
    }
    return respond(c, resourceDocument(People, view(row)));
  });

  app.get('/boom', () => {
    throw new Error('secret connection string');
  });
}
