import type { ResourceLinkage } from '../document/types';
import type { JsonApiEnv } from '../hono/types';
import type { AnyResource } from '../resource/types';
import type {
  AnyResourceHandlers,
  AtomicOptions,
  ResourceHandlers,
} from './types';

import { Hono } from 'hono';
import { z } from 'zod';

import { JsonApiError } from '../errors/json-api-error';
import { errorHandler } from '../hono/handlers';
import { jsonApi } from '../hono/middleware';
import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { toManyLinkage, toOneLinkage } from '../request/cardinality';
import { defineResource } from '../resource/define-resource';
import { atomicOperations } from './handler';

export interface AuthorRow {
  readonly id: string;
  readonly name: string;
}

export interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

export interface TagRow {
  readonly id: string;
  readonly name: string;
}

interface Snapshot {
  readonly authors: Map<string, AuthorRow>;
  readonly articles: Map<string, ArticleRow>;
  readonly tags: Map<string, TagRow>;
  readonly nextId: number;
}

/** An in-memory database with snapshot/restore standing in for a transaction. */
export class Store {
  public authors: Map<string, AuthorRow> = new Map();
  public articles: Map<string, ArticleRow> = new Map();
  public tags: Map<string, TagRow> = new Map([
    ['t1', { id: 't1', name: 'one' }],
  ]);
  public nextId = 1;
  public rollbacks = 0;

  public id(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }

  public snapshot(): Snapshot {
    return {
      authors: new Map(this.authors),
      articles: new Map(this.articles),
      tags: new Map(this.tags),
      nextId: this.nextId,
    };
  }

  public restore(snapshot: Snapshot): void {
    this.authors = new Map(snapshot.authors);
    this.articles = new Map(snapshot.articles);
    this.tags = new Map(snapshot.tags);
    this.nextId = snapshot.nextId;
    this.rollbacks += 1;
  }

  public article(id: string): ArticleRow {
    const row = this.articles.get(id);
    if (row === undefined) {
      throw JsonApiError.notFound(`Article "${id}" does not exist`);
    }
    return row;
  }
}

const AuthorsResource = defineResource({
  type: 'authors',
  attributes: ['name'],
  serialize: (row: AuthorRow) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  validate: { create: z.object({ name: z.string().min(1) }) },
  clientIds: true,
});
export const Authors: AnyResource = AuthorsResource;

const Articles = defineResource({
  type: 'articles',
  attributes: ['title'],
  relationships: {
    author: { type: 'authors', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
    reviewers: { type: 'authors', cardinality: 'many' },
  },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title },
    relationships: { author: row.authorId, tags: row.tagIds },
  }),
  links: { self: (id) => `https://api.test/articles/${id}` },
  validate: {
    create: z.object({ title: z.string().min(1) }),
    update: z.object({ title: z.string().min(1).optional() }),
  },
});

const Tags: AnyResource = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: TagRow) => ({ id: row.id, attributes: { name: row.name } }),
});

function ids(linkage: ResourceLinkage | undefined): ReadonlyArray<string> {
  return (toManyLinkage(linkage) ?? []).map((identifier) => identifier.id);
}

function toOneId(linkage: ResourceLinkage | undefined): string | null {
  return toOneLinkage(linkage)?.id ?? null;
}

// Typed against the definitions: attributes carry the validators' output.
const authors: ResourceHandlers<typeof AuthorsResource, Store, JsonApiEnv> = {
  resource: AuthorsResource,
  create: ({ data }, { tx }) => {
    const id = data.id ?? tx.id();
    const row: AuthorRow = { id, name: data.attributes.name };
    tx.authors.set(id, row);
    // A client-generated id with an identical representation: no data.
    return data.id === undefined ? row : undefined;
  },
  remove: ({ id }, { tx }) => {
    if (!tx.authors.delete(id)) {
      throw JsonApiError.notFound(`Author "${id}" does not exist`);
    }
  },
};

const articles: ResourceHandlers<typeof Articles, Store, JsonApiEnv> = {
  resource: Articles,
  create: ({ data }, { tx }) => {
    const row: ArticleRow = {
      id: tx.id(),
      title: data.attributes.title,
      authorId: toOneId(data.relationships['author']),
      tagIds: ids(data.relationships['tags']),
    };
    tx.articles.set(row.id, row);
    return row;
  },
  update: ({ id, data }, { tx }) => {
    const current = tx.article(id);
    const row: ArticleRow = {
      ...current,
      title: data.attributes.title ?? current.title,
      authorId:
        'author' in data.relationships
          ? toOneId(data.relationships['author'])
          : current.authorId,
    };
    tx.articles.set(id, row);
    return row;
  },
  remove: ({ id }, { tx }) => {
    tx.article(id);
    tx.articles.delete(id);
  },
  relationships: {
    author: {
      update: ({ id, data }, { tx }) => {
        tx.articles.set(id, { ...tx.article(id), authorId: toOneId(data) });
      },
    },
    tags: {
      update: ({ id, data }, { tx }) => {
        tx.articles.set(id, { ...tx.article(id), tagIds: ids(data) });
      },
      add: ({ id, data }, { tx }) => {
        const current = tx.article(id);
        tx.articles.set(id, {
          ...current,
          tagIds: [...new Set([...current.tagIds, ...ids(data)])],
        });
      },
      remove: ({ id, data }, { tx }) => {
        const current = tx.article(id);
        const removed = new Set(ids(data));
        tx.articles.set(id, {
          ...current,
          tagIds: current.tagIds.filter((tagId) => !removed.has(tagId)),
        });
      },
    },
  },
};

const tags: AnyResourceHandlers<Store, JsonApiEnv> = {
  resource: Tags,
  remove: ({ id }, { tx }) => {
    if (id === 'boom') {
      throw new Error('disk on fire');
    }
    tx.tags.delete(id);
  },
};

const HANDLERS: ReadonlyArray<AnyResourceHandlers<Store, JsonApiEnv>> = [
  authors,
  articles,
  tags,
];

export function createApp(
  store: Store,
  overrides: Partial<AtomicOptions<Store, JsonApiEnv>> = {},
): Hono<JsonApiEnv> {
  const app = new Hono<JsonApiEnv>();
  app.use(jsonApi({ extensions: [ATOMIC_OPERATIONS_EXTENSION] }));
  app.onError(errorHandler());
  app.all(
    '/operations',
    atomicOperations<Store, JsonApiEnv>({
      resources: HANDLERS,
      transaction: async (_c, run) => {
        const snapshot = store.snapshot();
        try {
          return await run(store);
        } catch (error) {
          store.restore(snapshot);
          throw error;
        }
      },
      ...overrides,
    }),
  );
  return app;
}

export const ATOMIC_MEDIA_TYPE: string = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;

export interface Result {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

export interface PostInit {
  readonly method?: string;
  readonly contentType?: string;
  readonly raw?: string;
}

/** Sends an operations document and returns the parsed response. */
export async function post(
  app: Hono<JsonApiEnv>,
  operations: ReadonlyArray<unknown>,
  init: PostInit = {},
): Promise<Result> {
  const method = init.method ?? 'POST';
  const response = await app.request('/operations', {
    method,
    headers: { 'content-type': init.contentType ?? ATOMIC_MEDIA_TYPE },
    ...(method === 'GET'
      ? {}
      : {
          body: init.raw ?? JSON.stringify({ 'atomic:operations': operations }),
        }),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}
