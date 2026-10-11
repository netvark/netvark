import { describe, expect, it } from 'vitest';

import { Things, VIOLATIONS } from '../test-support/violations';
import { constraintError } from './constraint-error';

/** The item paths of a domain CHECK's error under `pointer`. */
function itemPaths(pointer: string) {
  return constraintError(
    Object.assign(new Error('x'), {
      severity: 'ERROR',
      ...VIOLATIONS.domainCheck,
    }),
    {
      resource: Things,
      operation: 'create',
      pointer,
    },
  )?.errors?.map(({ path }) => path);
}

describe('constraintError: the pointer base', () => {
  it('nests the items under an Atomic Operations operation', () => {
    expect(itemPaths('/atomic:operations/2/data')).toEqual([
      ['atomic:operations', '2', 'data', 'attributes', 'code'],
    ]);
  });

  it('unescapes the reference tokens (RFC 6901 section 4)', () => {
    expect(itemPaths('/a~1b/c~0d')).toEqual([
      ['a/b', 'c~d', 'attributes', 'code'],
    ]);
    expect(itemPaths('')).toEqual([['attributes', 'code']]);
  });
});

describe('constraintError: what it does not own', () => {
  it.each([
    ['nothing', undefined],
    ['a plain Error', new Error('boom')],
    [
      'a Node.js system error',
      Object.assign(new Error('x'), { code: 'EPIPE' }),
    ],
  ])('returns undefined for %s', (_name, thrown) => {
    expect(
      constraintError(thrown, { resource: Things, operation: 'create' }),
    ).toBeUndefined();
  });
});

/** `constraintError` as JavaScript calls it: no type checks the options. */
function untypedCall(options: unknown) {
  return () =>
    Reflect.apply(constraintError, undefined, [new Error('x'), options]);
}

describe('constraintError: options JavaScript passes', () => {
  it.each([
    [
      undefined,
      'constraintError: options.resource must be a resource declareResource returned',
    ],
    [
      { resource: { table: 'things' }, operation: 'create' },
      'constraintError: options.resource must be a resource declareResource returned',
    ],
    [
      { resource: Things, operation: 'delete' },
      'constraintError: options.operation must be one of list, get, create, update, remove',
    ],
    [
      { resource: Things, operation: 'create', pointer: 'data' },
      'constraintError: options.pointer must be an RFC 6901 JSON Pointer',
    ],
    [
      { resource: Things, operation: 'create', pointer: '/a~2' },
      'constraintError: options.pointer must be an RFC 6901 JSON Pointer',
    ],
    [
      { resource: Things, operation: 'create', pointer: 7 },
      'constraintError: options.pointer must be an RFC 6901 JSON Pointer',
    ],
  ])('refuses %j', (options, message) => {
    expect(untypedCall(options)).toThrow(new TypeError(message));
  });
});
