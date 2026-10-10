import { describe, expect, it } from 'vitest';

import { createBan } from './create-ban';

const ban = createBan({
  adopt: (value, b) =>
    value instanceof RangeError ? b.badRequest(value.message) : undefined,
});

describe('ban.from', () => {
  it('returns BanErrors unchanged', () => {
    const error = ban.notFound();
    expect(ban.from(error)).toBe(error);
  });

  it('returns what the adopt hook recognizes', () => {
    const error = ban.from(new RangeError('out of range'));
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.detail).toBe('out of range');
  });

  it('turns anything else into a constant-detail 500', () => {
    for (const thrown of [
      new Error('secret'),
      'a string',
      { status: 400 },
      null,
    ]) {
      const error = ban.from(thrown);
      expect(error.status).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.detail).toBe('An unexpected error occurred');
      expect(error.cause).toBe(thrown);
    }
  });

  it('works without an adopt hook', () => {
    expect(createBan().from(new TypeError('x')).status).toBe(500);
  });

  it('never throws, even when the adopt hook does', () => {
    const broken = createBan({
      adopt: () => {
        throw new Error('hook broke');
      },
    });
    const error = broken.from('x');
    expect(error.status).toBe(500);
    expect(error.cause).toBe('x');
  });
});
