import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';

describe('ban.validation', () => {
  it('uses VALIDATION_FAILED by default, records the location in meta, and lists one item per issue', () => {
    const ban = createBan();
    const error = ban.validation(
      [
        { path: ['email'], message: 'Invalid', code: 'invalid_format' },
        { path: ['age'], message: 'Too low', expected: '>= 18', received: '7' },
      ],
      {
        location: 'body',
        detail: 'Fix the email',
        meta: { form: 'signup' },
      },
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.detail).toBe('Fix the email');
    expect(error.meta).toEqual({ form: 'signup', location: 'body' });
    expect(error.errors).toEqual([
      {
        detail: 'Invalid',
        location: 'body',
        path: ['email'],
        reason: 'invalid_format',
      },
      {
        detail: 'Too low',
        location: 'body',
        path: ['age'],
        expected: '>= 18',
        received: '7',
      },
    ]);
    expect(error.cause).toBeUndefined();
  });

  it('defaults detail to the validation summary and keeps an empty list', () => {
    const error = createBan().validation([], { location: 'query' });
    expect(error.detail).toBe('Request validation failed');
    expect(error.message).toBe('Request validation failed');
    expect(error.errors).toEqual([]);
  });

  it('keeps the caught failure as cause without rendering it', () => {
    const ban = createBan();
    const failure = new Error('driver text with a row value');
    const error = ban.validation([{ path: ['email'], message: 'Taken' }], {
      location: 'body',
      cause: failure,
    });
    expect(error.cause).toBe(failure);
    expect(JSON.stringify(ban.render(error).body)).not.toContain('row value');
  });
});
