import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isBanError } from '../core/ban-error';
import { createBan } from '../core/create-ban';
import { fromIssues, hook, toIssues } from './standard-schema';

const ban = createBan();

describe('toIssues (Standard Schema)', () => {
  it('reads raw keys and PathSegment objects', () => {
    expect(
      toIssues([
        { message: 'a', path: ['items', 0, { key: 'sku' }] },
        { message: 'b' },
        { message: 'c', path: [Symbol('tag')] },
      ]),
    ).toEqual([
      { path: ['items', 0, 'sku'], message: 'a' },
      { path: [], message: 'b' },
      { path: ['tag'], message: 'c' },
    ]);
  });

  it('works with real Zod and Valibot results through ~standard', async () => {
    const zodSchema = z.object({ n: z.number() });
    const zodResult = await zodSchema['~standard'].validate({ n: 'x' });
    expect(toIssues(zodResult.issues ?? [])).toEqual([
      { path: ['n'], message: expect.stringContaining('expected number') },
    ]);
    const valibotSchema = v.object({ n: v.number() });
    const valibotResult = await valibotSchema['~standard'].validate({
      n: 'x',
    });
    expect(toIssues(valibotResult.issues ?? [])[0]?.path).toEqual(['n']);
  });
});

describe('fromIssues', () => {
  it('builds the validation error', () => {
    const error = fromIssues(ban, [{ message: 'm', path: ['a'] }], 'header');
    expect(error.status).toBe(422);
    expect(error.meta).toEqual({ location: 'header' });
    expect(error.errors).toEqual([
      { detail: 'm', location: 'header', path: ['a'] },
    ]);
  });
});

describe('hook', () => {
  it('throws the validation error for a failed result of any Standard Schema library', async () => {
    const schema = z.object({ email: z.email() });
    const result = await schema['~standard'].validate({ email: 'nope' });
    let thrown: unknown;
    try {
      hook(ban)({ success: false, target: 'query', error: result.issues });
    } catch (error) {
      thrown = error;
    }
    expect(isBanError(thrown)).toBe(true);
    if (!isBanError(thrown)) {
      return;
    }
    expect(thrown.meta).toEqual({ location: 'query' });
    expect(thrown.errors?.[0]).toMatchObject({
      location: 'query',
      path: ['email'],
    });
  });

  it('returns for a successful result or one without issues', () => {
    expect(() => {
      hook(ban)({ success: true, target: 'json' });
      hook(ban)({ success: false, target: 'json' });
    }).not.toThrow();
  });
});
