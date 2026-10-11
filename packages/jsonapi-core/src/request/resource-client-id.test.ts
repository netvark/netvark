/**
 * A create's client-generated id (SPEC 5, 9.2): with `clientIds` and
 * `validate.id`, an id outside the validator's form is a 422 at the id,
 * before the attributes' issues in document order, and the parsed id is
 * the validator's output. An update's id is the URL's, which the host
 * resolves, so the parser never validates it; an atomic `add` validates
 * its id at the operation's pointer.
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 */
import { describe, expect, it } from 'vitest';

import { isBanError } from '@netvark/ban-core';

import { operationsProcessor } from '../atomic/process';
import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseCreateDocument, parseUpdateDocument } from './resource-document';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID = '0b7c1a9e-4f6d-4d8e-9a3b-2c1d0e9f8a7b';
const seen: Array<unknown> = [];

/** A UUID in either case, lower-cased, like a server that stores it so. */
const uuid = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => {
      seen.push(value);
      return typeof value === 'string' && UUID.test(value)
        ? { value: value.toLowerCase() }
        : {
            issues: [
              { message: 'Must be a UUID.', code: 'format', expected: 'uuid' },
            ],
          };
    },
  },
};

/** Requires a string `title`. */
const titled = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) =>
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'title') === 'string'
        ? { value }
        : { issues: [{ message: 'Required.', path: ['title'] }] },
  },
};

const Calls = defineResource({
  type: 'calls',
  attributes: ['title'],
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
  validate: { id: uuid, create: titled },
  clientIds: true,
});

async function refused(
  promise: Promise<unknown>,
): Promise<ReadonlyArray<readonly [number, string, unknown, unknown]>> {
  try {
    await promise;
  } catch (error) {
    if (isBanError(error)) {
      return errorObjects(error).map((object) => [
        error.status,
        object.code ?? '',
        object.source,
        object.meta,
      ]);
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe("a create's client-generated id", () => {
  it('refuses an id outside the form with a 422 at the id', async () => {
    expect(
      await refused(
        parseCreateDocument(Calls, {
          data: { type: 'calls', id: 'not-a-uuid', attributes: { title: 'A' } },
        }),
      ),
    ).toEqual([
      [
        422,
        'VALIDATION_FAILED',
        { pointer: '/data/id' },
        { code: 'format', expected: 'uuid' },
      ],
    ]);
  });

  it("reports the id's issue before the attributes' issues", async () => {
    const refusal = await refused(
      parseCreateDocument(Calls, {
        data: { type: 'calls', id: 'x', attributes: {} },
      }),
    );
    expect(refusal.map(([, , source]) => source)).toEqual([
      { pointer: '/data/id' },
      { pointer: '/data/attributes/title' },
    ]);
  });

  it("returns the validator's output as the id", async () => {
    const parsed = await parseCreateDocument(Calls, {
      data: { type: 'calls', id: ID.toUpperCase(), attributes: { title: 'A' } },
    });
    expect(parsed.id).toBe(ID);
  });

  it("never validates an update's id or a create without one", async () => {
    seen.length = 0;
    const created = await parseCreateDocument(Calls, {
      data: { type: 'calls', attributes: { title: 'A' } },
    });
    const updated = await parseUpdateDocument(
      Calls,
      { data: { type: 'calls', id: 'not-a-uuid', attributes: {} } },
      'not-a-uuid',
    );
    expect([created.id, updated.id]).toEqual([undefined, 'not-a-uuid']);
    expect(seen).toEqual([]);
  });

  it("validates an atomic add's id at the operation's pointer", async () => {
    const process = operationsProcessor<object, object>({
      resources: [{ resource: Calls, create: () => ({ id: ID }) }],
      transaction: async (_context, run) => run({}),
    });
    expect(
      await refused(
        process(
          {
            'atomic:operations': [
              {
                op: 'add',
                data: { type: 'calls', id: 'x', attributes: { title: 'A' } },
              },
            ],
          },
          {},
        ),
      ),
    ).toEqual([
      [
        422,
        'VALIDATION_FAILED',
        { pointer: '/atomic:operations/0/data/id' },
        { code: 'format', expected: 'uuid' },
      ],
    ]);
  });
});
