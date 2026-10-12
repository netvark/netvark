/**
 * The contacts API the screen tests meet (resource SPEC 20.8): the
 * fixture's contacts and organizations held in memory and served as the
 * server serves them, over the clients and the recorded `fetch` of
 * `query-server.ts`. jsonapi-core's `parseQuery` reads each list request
 * against the definition, so a parameter the definition refuses is the
 * same 400, and jsonapi-core builds every answer from the definition:
 * `paginatedDocument`, with its links and item cursors, for a list,
 * `resourceDocument` for a record, `errorDocument` for a refusal. A list
 * sorts by the parsed sort, else by name as the declaration's default
 * begins, keeps the rows its `eq`, `in`, and `startsWithi` conditions hold
 * and whose name or nickname holds its search, and pages by item cursor,
 * the row's id. A write answers what the test's `onWrite` returns, and
 * otherwise stores the members it carries. Requests are routed by the
 * paths `resourcePaths` reads from the definitions, as the routes and the
 * clients read them (jsonapi ADR 0017). Not published with the package.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type {
  FilterCondition,
  PageRequest,
  SortField,
} from '@netvark/jsonapi-core';

import type { Answer, Arrival, QueryServer } from './query-server';

import {
  errorDocument,
  isBanError,
  paginatedDocument,
  parseQuery,
  resourceDocument,
  resourcePaths,
} from '@netvark/jsonapi-core';

import { queryServer } from './query-server';
import { Contacts, Organizations } from './resources';

const OK = 200;
const CREATED = 201;
const NOT_FOUND = 404;

/** A stored row: its id, each member by public name, a relationship as its target's id. */
export interface Row {
  readonly id: string;
  readonly [member: string]: unknown;
}

/** What the API serves, and the answer to a write when the test decides it. */
export interface ApiOptions {
  readonly contacts: ReadonlyArray<Row>;
  /** The answer to a create or an update; `undefined` stores the write. */
  readonly onWrite?: ((arrival: Arrival) => Answer | undefined) | undefined;
}

/** The clients over the API, the requests they sent, and the rows it holds now. */
export interface ContactsApi extends QueryServer {
  readonly contacts: ReadonlyArray<Row>;
}

/** The id of the `n`th contact, in the key's own form (a uuid). */
export function contactId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** A contact as the API stores it, with the members the screens read, `members` over them. */
export function contactRow(
  n: number,
  name: string,
  members: Readonly<Record<string, unknown>> = {},
): Row {
  return {
    id: contactId(n),
    name,
    nickname: null,
    email: null,
    status: 'active',
    priority: null,
    organization: '1',
    createdAt: '2026-10-01T09:00:00Z',
    ...members,
  };
}

/** The organizations the create form chooses among. */
const ORGANIZATIONS: ReadonlyArray<Row> = [
  { id: '1', name: 'Acme' },
  { id: '2', name: 'Globex' },
];

const CONTACTS = resourcePaths(Contacts.resource).collection;
const ORGANIZATIONS_PATH = resourcePaths(Organizations.resource).collection;

const DEFAULT_SORT: ReadonlyArray<SortField> = [
  { field: 'name', direction: 'asc' },
];

/** A member's value as the API compares it: a string as it is, a number as its text, else empty. */
function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : '';
}

function order(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  const [a, b] = [textOf(left), textOf(right)];
  return a < b ? -1 : a > b ? 1 : 0;
}

function sorted(
  rows: ReadonlyArray<Row>,
  sort: ReadonlyArray<SortField>,
): Array<Row> {
  const fields = sort.length === 0 ? DEFAULT_SORT : sort;
  return rows.toSorted((left, right) => {
    for (const { field, direction } of fields) {
      const compared = order(left[field], right[field]);
      if (compared !== 0) {
        return direction === 'asc' ? compared : -compared;
      }
    }
    return order(left.id, right.id);
  });
}

function holds(row: Row, { field, operator, value }: FilterCondition): boolean {
  const stored = textOf(row[field]);
  const values = typeof value === 'string' ? [value] : value;
  if (operator === 'startsWithi') {
    return values.some((text) =>
      stored.toLowerCase().startsWith(text.toLowerCase()),
    );
  }
  return values.includes(stored);
}

function found(row: Row, search: string | undefined): boolean {
  if (search === undefined) {
    return true;
  }
  const text = `${textOf(row['name'])} ${textOf(row['nickname'])}`;
  return text.toLowerCase().includes(search.toLowerCase());
}

/** The rows of the page `page` asks for, and the cursors of the pages beside it. */
function paged(rows: ReadonlyArray<Row>, page: PageRequest) {
  const at = (id: string | undefined) => rows.findIndex((row) => row.id === id);
  const end =
    page.before === undefined ? rows.length : Math.max(at(page.before), 0);
  const start =
    page.after === undefined
      ? Math.max(page.before === undefined ? 0 : end - page.size, 0)
      : at(page.after) + 1;
  const shown = rows.slice(start, Math.min(start + page.size, end));
  const after = start + shown.length;
  return {
    rows: shown,
    next: after < rows.length ? (shown.at(-1)?.id ?? null) : null,
    prev: start > 0 ? (shown[0]?.id ?? null) : null,
  };
}

function list(
  arrival: Arrival,
  rows: ReadonlyArray<Row>,
  definition: typeof Contacts.resource,
): Answer {
  const parsed = parseQuery(definition, new URL(arrival.url).searchParams);
  const kept = rows.filter(
    (row) =>
      parsed.filter.conditions.every((condition) => holds(row, condition)) &&
      found(row, parsed.search),
  );
  const page = paged(
    sorted(kept, parsed.sort),
    parsed.page ?? {
      size: kept.length,
      after: undefined,
      before: undefined,
      sizeRequested: false,
      range: false,
    },
  );
  return {
    status: OK,
    document: paginatedDocument(
      definition,
      { ...page, cursor: (row: Row) => row.id },
      { url: arrival.url },
    ),
  };
}

/** The row a write's document carries, over `stored`. */
function written(stored: Row, body: unknown): Row {
  const { data } = body as {
    data: {
      attributes?: Record<string, unknown>;
      relationships?: Record<string, { data: { id: string } | null }>;
    };
  };
  const linked = Object.entries(data.relationships ?? {}).map(
    ([name, { data: target }]) => [name, target?.id ?? null] as const,
  );
  return { ...stored, ...data.attributes, ...Object.fromEntries(linked) };
}

/** The API over `options`, its contacts changed by the writes it stores. */
export function contactsApi(options: ApiOptions): ContactsApi {
  let contacts = [...options.contacts];
  const answer = (arrival: Arrival): Answer => {
    const { pathname } = new URL(arrival.url);
    if (pathname === ORGANIZATIONS_PATH) {
      return list(arrival, ORGANIZATIONS, Organizations.resource);
    }
    if (pathname === CONTACTS && arrival.method === 'GET') {
      return list(arrival, contacts, Contacts.resource);
    }
    const id = decodeURIComponent(pathname.slice(CONTACTS.length + 1));
    const decided =
      arrival.method === 'GET' ? undefined : options.onWrite?.(arrival);
    if (decided !== undefined) {
      return decided;
    }
    const stored = contacts.find((row) => row.id === id);
    if (arrival.method === 'POST') {
      const row = written(contactRow(contacts.length + 1, ''), arrival.body);
      contacts = [...contacts, row];
      return {
        status: CREATED,
        document: resourceDocument(Contacts.resource, row),
      };
    }
    if (stored === undefined) {
      return { status: NOT_FOUND, document: { errors: [{ status: '404' }] } };
    }
    const row =
      arrival.method === 'PATCH' ? written(stored, arrival.body) : stored;
    contacts = contacts.map((each) => (each.id === row.id ? row : each));
    return { status: OK, document: resourceDocument(Contacts.resource, row) };
  };
  const server = queryServer((arrival) => {
    try {
      return answer(arrival);
    } catch (error) {
      if (isBanError(error)) {
        return { status: error.status, document: errorDocument(error) };
      }
      throw error;
    }
  });
  return {
    ...server,
    get contacts() {
      return contacts;
    },
  };
}
