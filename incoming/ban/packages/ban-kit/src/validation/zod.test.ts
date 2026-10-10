import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as z3 from 'zod/v3';

import { isBanError } from '../core/ban-error';
import { createBan } from '../core/create-ban';
import { defaultHook, fromZodError, hook, toIssues } from './zod';

const ban = createBan();
const schema = z.object({
  email: z.email(),
  items: z.array(z.object({ sku: z.string() })),
  kind: z.enum(['a', 'b']),
});

function caught(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('toIssues (Zod 4)', () => {
  it('maps path, message, code, and expected', () => {
    const result = schema.safeParse({ email: 'nope', items: [{}], kind: 'c' });
    expect(result.success).toBe(false);
    const issues = toIssues(result.error as z.ZodError);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['email'], code: 'invalid_format' }),
        expect.objectContaining({
          path: ['items', 0, 'sku'],
          code: 'invalid_type',
          expected: 'string',
        }),
        expect.objectContaining({ path: ['kind'], code: 'invalid_value' }),
      ]),
    );
    for (const issue of issues) {
      expect(typeof issue.message).toBe('string');
    }
  });
});

describe('toIssues (Zod 3 compatibility)', () => {
  it('reads the same fields from a zod/v3 error', () => {
    const result = z3.object({ n: z3.number() }).safeParse({ n: 'x' });
    expect(result.success).toBe(false);
    expect(toIssues(result.error as z3.ZodError)).toEqual([
      {
        path: ['n'],
        message: 'Expected number, received string',
        code: 'invalid_type',
        expected: 'number',
        received: 'string',
      },
    ]);
  });
});

describe('fromZodError', () => {
  it('builds the validation error for a location', () => {
    const result = schema.safeParse({});
    const error = fromZodError(ban, result.error as z.ZodError, 'query', {
      detail: 'Fix it',
    });
    expect(error.status).toBe(422);
    expect(error.detail).toBe('Fix it');
    expect(error.meta).toEqual({ location: 'query' });
    expect(error.errors?.length).toBeGreaterThan(0);
    expect(error.errors?.[0]).toMatchObject({ location: 'query' });
  });
});

describe('hook', () => {
  it('throws the validation error for a failed result, at the target location', () => {
    const result = schema.safeParse({ email: 'nope', items: [], kind: 'a' });
    expect(result.success).toBe(false);
    const thrown = caught(() => {
      hook(ban)({ success: false, target: 'json', error: result.error });
    });
    expect(isBanError(thrown)).toBe(true);
    if (!isBanError(thrown)) {
      return;
    }
    expect(thrown.status).toBe(422);
    expect(thrown.meta).toEqual({ location: 'body' });
    expect(thrown.errors).toEqual([
      {
        detail: expect.any(String),
        location: 'body',
        path: ['email'],
        reason: 'invalid_format',
      },
    ]);
  });

  it('maps every target to its location', () => {
    const result = z.object({ page: z.coerce.number() }).safeParse({
      page: 'x',
    });
    for (const [target, location] of [
      ['query', 'query'],
      ['param', 'param'],
      ['header', 'header'],
      ['cookie', 'cookie'],
      ['form', 'form'],
    ] as const) {
      const thrown = caught(() => {
        hook(ban)({ success: false, target, error: result.error });
      });
      expect(isBanError(thrown) && thrown.meta['location']).toBe(location);
    }
  });

  it('returns for a successful result or one without an error', () => {
    expect(() => {
      hook(ban)({ success: true, target: 'json' });
      hook(ban)({ success: false, target: 'json' });
    }).not.toThrow();
  });

  it('is what defaultHook returns for OpenAPIHono', () => {
    const result = schema.safeParse({});
    const thrown = caught(() => {
      defaultHook(ban)({
        success: false,
        target: 'param',
        error: result.error,
      });
    });
    expect(isBanError(thrown) && thrown.meta['location']).toBe('param');
    expect(() => {
      defaultHook(ban)({ success: true, target: 'param' });
    }).not.toThrow();
  });
});
