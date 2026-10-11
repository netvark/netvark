/**
 * ADR 0016 across the operations document parser and the runners: hostile
 * text in a member name, a type, a relationship name, an href, or a lid
 * never reaches a detail, while a plain token reaching the same refusal is
 * quoted.
 */
import type { ErrorObject } from '../document/types';
import type { Caller } from './test-fixtures';
import type { AtomicOptions } from './types';

import { describe, it } from 'vitest';

import {
  HOSTILE,
  TOKEN,
  errorsOf,
  expectControl,
  expectWithheld,
} from '../test-support/request-text';
import { CALLER, Store, createProcessor } from './test-fixtures';

interface Case {
  readonly name: string;
  /** The error objects of a document carrying `value`. */
  readonly errors: (value: string) => Promise<ReadonlyArray<ErrorObject>>;
}

const REMOVE_TAG = { op: 'remove', ref: { type: 'tags', id: '1' } };

async function operations(
  list: ReadonlyArray<unknown>,
  members: Record<string, unknown> = {},
  options: Partial<AtomicOptions<Store, Caller>> = {},
): Promise<ReadonlyArray<ErrorObject>> {
  const process = createProcessor(new Store(), options);
  return errorsOf(async () =>
    process({ 'atomic:operations': list, ...members }, CALLER),
  );
}

function addAuthor(lid: string): Record<string, unknown> {
  return {
    op: 'add',
    data: { type: 'authors', lid, attributes: { name: 'Ada' } },
  };
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'a member an operations document does not have',
    errors: async (value) => operations([REMOVE_TAG], { [value]: 1 }),
  },
  {
    name: 'a member an operation does not have',
    errors: async (value) => operations([{ ...REMOVE_TAG, [value]: 1 }]),
  },
  {
    name: 'a member a ref does not have',
    errors: async (value) =>
      operations([
        { op: 'remove', ref: { type: 'tags', id: '1', [value]: 1 } },
      ]),
  },
  {
    name: 'an href that names no operation target',
    errors: async (value) =>
      operations(
        [{ op: 'remove', href: value }],
        {},
        {
          resolveHref: (href) =>
            href.startsWith('/tags/')
              ? { type: 'tags', id: href.slice(6) }
              : undefined,
        },
      ),
  },
  {
    name: 'a resource type no handlers serve',
    errors: async (value) =>
      operations([{ op: 'remove', ref: { type: value, id: '1' } }]),
  },
  {
    name: 'a relationship the type does not have',
    errors: async (value) =>
      operations([
        {
          op: 'update',
          ref: { type: 'articles', id: '1', relationship: value },
          data: null,
        },
      ]),
  },
  {
    name: 'a lid no earlier operation created',
    errors: async (value) =>
      operations([{ op: 'remove', ref: { type: 'tags', lid: value } }]),
  },
  {
    name: 'a lid two operations create',
    errors: async (value) => operations([addAuthor(value), addAuthor(value)]),
  },
  {
    name: "a document lid that is not the target's",
    errors: async (value) =>
      operations([
        {
          op: 'add',
          data: { type: 'articles', lid: 'a1', attributes: { title: 'T' } },
        },
        {
          op: 'update',
          ref: { type: 'articles', lid: 'a1' },
          data: { type: 'articles', lid: value, attributes: { title: 'U' } },
        },
      ]),
  },
];

describe.each(CASES)('$name', ({ errors }) => {
  it.each(HOSTILE)('withholds %s', async (_label, value) => {
    const reference = expectControl(await errors(TOKEN), TOKEN, true);
    expectWithheld(await errors(value), reference, value);
  });
});
