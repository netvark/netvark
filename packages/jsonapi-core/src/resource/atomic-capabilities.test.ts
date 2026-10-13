import { describe, expect, it } from 'vitest';

import { resolveAtomic } from './atomic-capabilities';
import { defineResource } from './define-resource';

function tags(atomic?: { max?: number }) {
  return defineResource({
    type: 'tags',
    attributes: ['label'],
    serialize: (row: { id: string; label: string }) => ({
      id: row.id,
      attributes: { label: row.label },
    }),
    atomic,
  });
}

describe('resolveAtomic', () => {
  it('takes 10 operations per request when the definition gives no cap', () => {
    expect(resolveAtomic({})).toEqual({ max: 10 });
    expect(resolveAtomic({ max: undefined })).toEqual({ max: 10 });
  });

  it('keeps a cap that is a positive safe integer', () => {
    expect(resolveAtomic({ max: 1 })).toEqual({ max: 1 });
    expect(resolveAtomic({ max: 50 })).toEqual({ max: 50 });
    expect(resolveAtomic({ max: Number.MAX_SAFE_INTEGER })).toEqual({
      max: Number.MAX_SAFE_INTEGER,
    });
  });

  it('refuses any other cap, naming the member', () => {
    for (const max of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
      '10',
    ]) {
      expect(() => resolveAtomic({ max: max as number })).toThrow(
        new TypeError(
          `atomic.max must be a positive safe integer, received ${String(max)}`,
        ),
      );
    }
  });

  it('is the cap a definition carries', () => {
    expect(tags().atomic).toEqual({ max: 10 });
    expect(tags({ max: 25 }).atomic).toEqual({ max: 25 });
    expect(() => tags({ max: 0 })).toThrow(TypeError);
  });
});
