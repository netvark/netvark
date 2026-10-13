/**
 * `operationOf` (SPEC 17.3): an error object's `source.pointer` read as
 * the operation it names, `/atomic:operations/<index>` with an RFC 6901
 * array index, and the pointer within it; anything else names none.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-4
 */
import { describe, expect, it } from 'vitest';

import { operationOf } from './operation-of';

const at = (pointer: string) => operationOf({ source: { pointer } });

describe('operationOf (SPEC 17.3)', () => {
  it.each([
    ['/atomic:operations/0', { index: 0, pointer: '' }],
    [
      '/atomic:operations/12/data/attributes/email',
      { index: 12, pointer: '/data/attributes/email' },
    ],
    [
      '/atomic:operations/1/data/attributes/a~1b',
      { index: 1, pointer: '/data/attributes/a~1b' },
    ],
    [
      '/atomic:operations/2/data/attributes/line\nbreak',
      { index: 2, pointer: '/data/attributes/line\nbreak' },
    ],
    ['/atomic:operations/3/', { index: 3, pointer: '/' }],
    ['/atomic:operations/99', { index: 99, pointer: '' }],
  ])('reads %j as the operation it points at', (pointer, expected) => {
    expect(at(pointer)).toStrictEqual(expected);
  });

  it.each([
    '/data/attributes/email',
    '/atomic:operations',
    '/atomic:operations/',
    '/atomic:operations/01',
    '/atomic:operations/-1',
    '/atomic:operations/1a',
    '/atomic:operations/x/data',
    '/atomic:results/0',
    '/data/atomic:operations/0',
    '/atomic:operations/9007199254740993',
  ])('names no operation for %j', (pointer) => {
    expect(at(pointer)).toBeUndefined();
  });

  it('names no operation for an error without a pointer', () => {
    expect(operationOf({ code: 'CONFLICT' })).toBeUndefined();
    expect(operationOf({ source: { parameter: 'include' } })).toBeUndefined();
  });
});
