import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { isBanError } from '../core/ban-error';
import { createBan } from '../core/create-ban';
import { fromValibotIssues, hook, toIssues } from './valibot';

const ban = createBan();
const { map: mapSchema } = v;
const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  items: v.array(v.object({ sku: v.string() })),
  tags: mapSchema(v.string(), v.number()),
});

describe('toIssues (Valibot)', () => {
  it('keeps type, expected, received, and nested paths', () => {
    const result = v.safeParse(schema, {
      email: 'nope',
      items: [{ sku: 1 }],
      tags: new Map([['a', 'x']]),
    });
    expect(result.success).toBe(false);
    const issues = toIssues(result.issues ?? []);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['email'],
          code: 'email',
          received: '"nope"',
        }),
        expect.objectContaining({
          path: ['items', 0, 'sku'],
          code: 'string',
          expected: 'string',
          received: '1',
        }),
        expect.objectContaining({ path: ['tags', 'a'], code: 'number' }),
      ]),
    );
  });

  it('omits expected when Valibot reports null and tolerates exotic keys', () => {
    expect(
      toIssues([
        {
          type: 'custom',
          message: 'm',
          expected: null,
          received: 'x',
          path: [{ key: { object: true } }, { key: true }, { key: 3n }],
        },
      ]),
    ).toEqual([
      { path: ['?', 'true', '3'], message: 'm', code: 'custom', received: 'x' },
    ]);
  });
});

describe('fromValibotIssues', () => {
  it('builds the validation error', () => {
    const result = v.safeParse(schema, {});
    const error = fromValibotIssues(ban, result.issues ?? [], 'form');
    expect(error.status).toBe(422);
    expect(error.meta).toEqual({ location: 'form' });
    expect(error.errors?.[0]).toMatchObject({ location: 'form' });
  });
});

describe('hook', () => {
  it('throws the validation error for a failed result', () => {
    const result = v.safeParse(
      v.object({ email: v.pipe(v.string(), v.email()) }),
      { email: 'nope' },
    );
    let thrown: unknown;
    try {
      hook(ban)({ success: false, target: 'json', issues: result.issues });
    } catch (error) {
      thrown = error;
    }
    expect(isBanError(thrown)).toBe(true);
    if (!isBanError(thrown)) {
      return;
    }
    expect(thrown.code).toBe('VALIDATION_FAILED');
    expect(thrown.errors).toEqual([
      {
        detail: expect.any(String),
        location: 'body',
        path: ['email'],
        reason: 'email',
        received: '"nope"',
      },
    ]);
  });

  it('returns for a successful result or one without issues', () => {
    expect(() => {
      hook(ban)({ success: true, target: 'json' });
      hook(ban)({ success: false, target: 'json' });
    }).not.toThrow();
  });
});
