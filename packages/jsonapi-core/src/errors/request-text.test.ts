/**
 * ADR 0016 across the query and request document parsers, negotiation,
 * and the builders that take request text: hostile text the client sends
 * never reaches a detail, while a plain token reaching the same refusal
 * is quoted.
 */
import type { ErrorObject } from '../document/types';

import { describe, it } from 'vitest';

import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { negotiate } from '../negotiate/negotiate';
import { unsupportedSort } from '../pagination/errors';
import { parseQuery } from '../query/parse-query';
import { Articles } from '../query/test-fixtures';
import { parseToOneRelationshipDocument } from '../request/relationship-document';
import {
  parseCreateDocument,
  parseUpdateDocument,
} from '../request/resource-document';
import {
  HOSTILE,
  HOSTILE_NAMES,
  HOSTILE_TEXT,
  TOKEN,
  errorsOf,
  expectControl,
  expectWithheld,
} from '../test-support/request-text';

interface Case {
  readonly name: string;
  /** Hostile values that reach this refusal, by label. */
  readonly values: ReadonlyArray<readonly [string, string]>;
  /** The error objects of a request carrying `value`. */
  readonly errors: (value: string) => Promise<ReadonlyArray<ErrorObject>>;
  /** A plain token that reaches the same refusal; default `TOKEN`. */
  readonly control?: string;
  /** False where the detail never quotes the value, a plain token included. */
  readonly quoted?: boolean;
}

const JSON_API = 'application/vnd.api+json';

async function query(
  input: Record<string, string | Array<string>>,
): Promise<ReadonlyArray<ErrorObject>> {
  return errorsOf(() => parseQuery(Articles, input));
}

async function contentType(value: string): Promise<ReadonlyArray<ErrorObject>> {
  const result = negotiate(
    { contentType: value },
    { extensions: [ATOMIC_OPERATIONS_EXTENSION] },
  );
  return errorsOf(() => {
    if (!result.ok) {
      throw result.error;
    }
  });
}

async function create(
  data: Record<string, unknown>,
): Promise<ReadonlyArray<ErrorObject>> {
  return errorsOf(async () => parseCreateDocument(Articles, { data }));
}

const QUERY: ReadonlyArray<Case> = [
  {
    name: 'an unknown query parameter',
    values: HOSTILE,
    errors: async (value) => query({ [value]: '1' }),
  },
  {
    name: 'a query parameter sent twice',
    values: HOSTILE_NAMES,
    errors: async (value) => query({ [`fields[${value}]`]: ['title', 'body'] }),
  },
  {
    name: 'an include path that is not a member path',
    values: HOSTILE_TEXT,
    errors: async (value) => query({ include: value }),
    control: 'no..pe',
  },
  {
    name: 'an include path the endpoint does not declare',
    values: HOSTILE_NAMES,
    errors: async (value) => query({ include: value }),
  },
  {
    name: 'fields for a type no response carries',
    values: HOSTILE_NAMES,
    errors: async (value) => query({ [`fields[${value}]`]: 'title' }),
  },
  {
    name: 'a field the type does not have',
    values: HOSTILE,
    errors: async (value) => query({ 'fields[articles]': value }),
  },
  {
    name: 'a sort field the endpoint does not declare',
    values: HOSTILE,
    errors: async (value) => query({ sort: value }),
  },
  {
    name: 'a page size that is not a positive integer',
    values: HOSTILE,
    errors: async (value) => query({ 'page[size]': value }),
  },
  {
    name: 'a filter field the endpoint does not declare',
    values: HOSTILE_NAMES,
    errors: async (value) => query({ [`filter[${value}]`]: '1' }),
  },
  {
    name: 'an operator the filter field does not take',
    values: HOSTILE_NAMES,
    errors: async (value) => query({ [`filter[title][${value}]`]: '1' }),
  },
];

const BUILDERS_AND_NEGOTIATION: ReadonlyArray<Case> = [
  {
    name: 'unsupportedSort, from an engine',
    values: HOSTILE,
    errors: async (value) =>
      errorsOf(() => {
        throw unsupportedSort(value);
      }),
  },
  {
    name: 'an extension the endpoint does not support',
    values: [
      ['URL', 'https://evil.example/support'],
      ['markup', '<script>alert(1)</script>'],
      ['10 kB URI', `https://evil.example/${'a'.repeat(10_240)}`],
    ],
    errors: async (value) => contentType(`${JSON_API}; ext="${value}"`),
    quoted: false,
  },
  {
    name: 'a media type parameter other than ext and profile',
    values: [
      ['10 kB token', 't'.repeat(10_240)],
      ['token punctuation', "x'`|%&y"],
    ],
    errors: async (value) => contentType(`${JSON_API}; ${value}=1`),
  },
];

const DOCUMENTS: ReadonlyArray<Case> = [
  {
    name: 'a member a resource object does not have',
    values: HOSTILE,
    errors: async (value) => create({ type: 'articles', [value]: 1 }),
  },
  {
    name: 'a resource object of another type',
    values: HOSTILE,
    errors: async (value) => create({ type: value }),
  },
  {
    name: 'an attribute the type does not have',
    values: HOSTILE,
    errors: async (value) =>
      create({ type: 'articles', attributes: { [value]: 1 } }),
  },
  {
    name: 'a relationship the type does not have',
    values: HOSTILE,
    errors: async (value) =>
      create({ type: 'articles', relationships: { [value]: { data: null } } }),
  },
  {
    name: 'linkage to a resource of another type',
    values: HOSTILE,
    errors: async (value) =>
      create({
        type: 'articles',
        relationships: { author: { data: { type: value, id: '1' } } },
      }),
  },
  {
    name: "a document id that is not the request's",
    values: HOSTILE,
    errors: async (value) =>
      errorsOf(async () =>
        parseUpdateDocument(
          Articles,
          { data: { type: 'articles', id: value } },
          '1',
        ),
      ),
  },
  {
    name: "a request id that is not the document's",
    values: HOSTILE,
    errors: async (value) =>
      errorsOf(async () =>
        parseUpdateDocument(
          Articles,
          { data: { type: 'articles', id: '1' } },
          value,
        ),
      ),
  },
  {
    name: 'a relationship document of another type',
    values: HOSTILE,
    errors: async (value) =>
      errorsOf(() =>
        parseToOneRelationshipDocument(
          { data: { type: value, id: '1' } },
          { type: 'people' },
        ),
      ),
  },
];

describe.each([...QUERY, ...BUILDERS_AND_NEGOTIATION, ...DOCUMENTS])(
  '$name',
  ({ values, errors, control = TOKEN, quoted = true }) => {
    it.each(values)('withholds %s', async (_label, value) => {
      const reference = expectControl(await errors(control), control, quoted);
      expectWithheld(await errors(value), reference, value);
    });
  },
);
