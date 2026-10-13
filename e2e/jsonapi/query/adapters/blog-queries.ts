/**
 * What the adapter checks give each adapter's hooks (SPEC 16.5): the
 * options `resourceQueries` of the built `@netvark/tanstack-query-jsonapi`
 * makes over clients of the blog's definitions, the queries the checks
 * pass, and, as the oracle, what the client's own calls resolve to for
 * the same queries. Read by the type check only: nothing here runs.
 */
import type { CreateInput } from '@netvark/jsonapi-client';
import type { UpdateVariables } from '@netvark/tanstack-query-jsonapi';

import { createClients, createTransport } from '@netvark/jsonapi-client';
import { resourceQueries } from '@netvark/tanstack-query-jsonapi';

import { Articles, People, Tags } from '../../support/resources.ts';

const clients = createClients(
  { articles: Articles, people: People, tags: Tags },
  createTransport({ origin: 'https://blog.example' }),
);

export const articles = resourceQueries(clients.articles);
export const people = resourceQueries(clients.people);

/** A list's query: the author of each article included. */
export const LISTED = { include: ['author'] } as const;
/** A record's query: the title alone. */
export const SPARSE = { fields: { articles: ['title'] } } as const;
/** An infinite list's query: newest first, three a page. */
export const NEWEST = { sort: ['-createdAt'], page: { size: 3 } } as const;

async function listed() {
  return clients.articles.list(LISTED);
}

async function sparse() {
  return clients.articles.get('1', SPARSE);
}

async function newest() {
  return clients.articles.list(NEWEST);
}

async function created() {
  return clients.articles.create({ attributes: { title: 'Adapters' } });
}

/** What `clients.articles.list(LISTED)` resolves to. */
export type Listed = Awaited<ReturnType<typeof listed>>;
/** What `clients.articles.get('1', SPARSE)` resolves to. */
export type Sparse = Awaited<ReturnType<typeof sparse>>;
/** A page of `clients.articles.list(NEWEST)`. */
export type Page = Awaited<ReturnType<typeof newest>>;
/** What `clients.articles.create(input)` resolves to. */
export type Created = Awaited<ReturnType<typeof created>>;
/** What a create of an article takes. */
export type ArticleInput = CreateInput<typeof Articles>;
/** What an update of an article takes. */
export type ArticleUpdate = UpdateVariables<typeof Articles>;
