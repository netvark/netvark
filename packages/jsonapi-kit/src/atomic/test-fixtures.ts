/**
 * The store, definitions, and handlers the atomic tests share; the runner
 * that reports an outcome is in test-run.ts. Not published.
 */
import type { ResourceLinkage } from '../document/types';
import type { AnyResource } from '../resource/types';
import type { OperationsProcessor } from './process';
import type {
  AnyResourceHandlers,
  AtomicOptions,
  ResourceHandlers,
} from './types';

import { z } from 'zod';

import { JsonApiError } from '../errors/json-api-error';
import { toManyLinkage, toOneLinkage } from '../request/cardinality';
import { defineResource } from '../resource/define-resource';
import { operationsProcessor } from './process';

/** What the host hands to the processor per request: here, who is calling. */
export interface Caller {
  readonly user: string;
}

export const CALLER: Caller = { user: 'alice' };

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
const authors: ResourceHandlers<typeof AuthorsResource, Store, Caller> = {
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

const articles: ResourceHandlers<typeof Articles, Store, Caller> = {
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

const tags: AnyResourceHandlers<Store, Caller> = {
  resource: Tags,
  remove: ({ id }, { tx }) => {
    if (id === 'boom') {
      throw new Error('disk on fire');
    }
    tx.tags.delete(id);
  },
};

const HANDLERS: ReadonlyArray<AnyResourceHandlers<Store, Caller>> = [
  authors,
  articles,
  tags,
];

/** A processor over `store` with a snapshot transaction that rolls back on failure. */
export function createProcessor(
  store: Store,
  overrides: Partial<AtomicOptions<Store, Caller>> = {},
): OperationsProcessor<Caller> {
  return operationsProcessor<Store, Caller>({
    resources: HANDLERS,
    transaction: async (_ctx, run) => {
      const snapshot = store.snapshot();
      try {
        return await run(store);
      } catch (error) {
        store.restore(snapshot);
        throw error;
      }
    },
    ...overrides,
  });
}
