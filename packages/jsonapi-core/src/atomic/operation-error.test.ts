/**
 * `errorAtOperation` (SPEC 11.1): an item without a path gets the
 * operation's pointer, an item with one keeps it, and an error without
 * items becomes one item with its own identity and message, all as the
 * processor renders an operation's failure.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import { describe, expect, it } from 'vitest';

import { errorObjects, jsonApiError } from '../errors/json-api-error';
import { errorAtOperation } from './operation-error';

describe('errorAtOperation (SPEC 11.1)', () => {
  it('points every item without a path at the operation, and keeps the rest', () => {
    const error = jsonApiError([
      { code: 'NOT_FOUND', status: 404, detail: 'No row' },
      {
        code: 'VALIDATION_FAILED',
        status: 422,
        detail: 'Too long',
        path: ['atomic:operations', 1, 'data', 'attributes', 'title'],
      },
    ]);
    const objects = errorObjects(
      errorAtOperation(error, '/atomic:operations/1'),
    );
    expect(objects.map((object) => object.source)).toEqual([
      { pointer: '/atomic:operations/1' },
      { pointer: '/atomic:operations/1/data/attributes/title' },
    ]);
  });

  it('turns an error without items into one, with its own message', () => {
    const error = jsonApiError('CONFLICT', {
      detail: 'The resource is still referenced.',
    });
    const moved = errorAtOperation(error, '/atomic:operations/0');
    expect(moved.id).toBe(error.id);
    expect(errorObjects(moved)).toMatchObject([
      {
        status: '409',
        code: 'CONFLICT',
        detail: 'The resource is still referenced.',
        source: { pointer: '/atomic:operations/0' },
      },
    ]);
  });

  it('returns an error whose items all point somewhere as it is', () => {
    const error = jsonApiError([
      {
        code: 'NOT_FOUND',
        status: 404,
        detail: 'No row',
        path: ['data', 'id'],
      },
    ]);
    expect(errorAtOperation(error, '/atomic:operations/0')).toBe(error);
  });

  it('refuses a pointer that is not one', () => {
    expect(() =>
      errorAtOperation(jsonApiError('CONFLICT'), 'atomic:operations/0'),
    ).toThrow(TypeError);
  });
});
