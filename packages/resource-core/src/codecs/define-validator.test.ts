import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as zm from 'zod/mini';
import { $ZodError } from 'zod/v4/core';

import { typeErrorOf } from '../test-support/failure';
import { defineValidator, isValidator } from './define-validator';

/** `defineValidator` with its types erased, as JavaScript calls it. */
const defineUntyped = defineValidator as unknown as (init: unknown) => unknown;

/** The twin of `CHECK (room = lower(room))` on a NOT NULL column. */
const lowercase = z.string().refine((value) => value === value.toLowerCase());
const valid = {
  schema: lowercase,
  fixtures: { accept: ['a-12', ''], reject: ['A-12'] },
} as const;

describe('defineValidator (SPEC 7.2)', () => {
  it('returns a frozen validator that holds copies of its fixtures', () => {
    const accept = ['a-12'] as const;
    const validator = defineValidator({
      schema: lowercase,
      fixtures: { accept, reject: ['A-12'] },
      description: 'Room names are lower case.',
    });
    expect(isValidator(validator)).toBe(true);
    expect(validator).toEqual({
      schema: lowercase,
      fixtures: { accept: ['a-12'], reject: ['A-12'] },
      description: 'Room names are lower case.',
    });
    expect(Object.isFrozen(validator)).toBe(true);
    expect(Object.isFrozen(validator.fixtures)).toBe(true);
    expect(Object.isFrozen(validator.fixtures.accept)).toBe(true);
    expect(validator.fixtures.accept).not.toBe(accept);
  });

  it('takes an object of the CHECK fields by public name for a multi-column CHECK', () => {
    const startsBeforeEnd = defineValidator({
      schema: z
        .object({ startsOn: z.iso.date(), endsOn: z.iso.date() })
        .refine(({ startsOn, endsOn }) => startsOn <= endsOn),
      fixtures: {
        accept: [{ startsOn: '2026-01-01', endsOn: '2026-01-01' }],
        reject: [{ startsOn: '2026-01-02', endsOn: '2026-01-01' }],
      },
    });
    expect(isValidator(startsBeforeEnd)).toBe(true);
  });

  it('accepts a Zod Mini schema', () => {
    const validator = defineValidator({
      schema: zm.string().check(zm.maxLength(3)),
      fixtures: { accept: ['abc'], reject: ['abcd'] },
    });
    expect(isValidator(validator)).toBe(true);
  });

  it('brands only what it returned', () => {
    expect(isValidator({ ...defineValidator(valid) })).toBe(false);
    expect(isValidator(42)).toBe(false);
  });

  it('refuses fixture lists that are missing or empty, and unknown lists', () => {
    expect(
      typeErrorOf(() =>
        defineUntyped({ ...valid, fixtures: { accept: [], reject: ['A'] } }),
      ),
    ).toBe(
      'defineValidator.fixtures.accept: must be a non-empty list of values',
    );
    expect(
      typeErrorOf(() =>
        defineUntyped({ ...valid, fixtures: { accept: ['a'] } }),
      ),
    ).toBe(
      'defineValidator.fixtures.reject: must be a non-empty list of values',
    );
    expect(
      typeErrorOf(() =>
        defineUntyped({
          ...valid,
          fixtures: { ...valid.fixtures, rejects: ['B'] },
        }),
      ),
    ).toBe('defineValidator.fixtures: unknown member "rejects"');
    expect(typeErrorOf(() => defineUntyped({ schema: lowercase }))).toBe(
      'defineValidator.fixtures: must be an object, received undefined',
    );
  });

  it('names an accept fixture the schema rejects, with the Zod error as its cause', () => {
    let thrown: unknown;
    try {
      defineUntyped({
        ...valid,
        fixtures: { accept: ['a', 'Lobby'], reject: ['A'] },
      });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as TypeError).message).toBe(
      'defineValidator.fixtures.accept[1]: the schema rejects this fixture',
    );
    expect((thrown as TypeError).cause).toBeInstanceOf($ZodError);
  });

  it('names a reject fixture the schema accepts', () => {
    expect(
      typeErrorOf(() =>
        defineUntyped({
          ...valid,
          fixtures: { accept: ['a'], reject: ['A', 'b'] },
        }),
      ),
    ).toBe(
      'defineValidator.fixtures.reject[1]: the schema accepts this fixture',
    );
  });

  it('refuses an asynchronous schema, a non-Zod schema, and unknown members', () => {
    expect(
      typeErrorOf(() =>
        defineUntyped({
          ...valid,
          schema: z.string().refine(async () => {
            await Promise.resolve();
            return true;
          }),
        }),
      ),
    ).toBe('defineValidator.schema: must parse synchronously');
    expect(typeErrorOf(() => defineUntyped({ ...valid, schema: {} }))).toBe(
      'defineValidator.schema: must be a Zod 4 schema (zod or zod/mini)',
    );
    expect(typeErrorOf(() => defineUntyped({ ...valid, fixture: {} }))).toBe(
      'defineValidator: unknown member "fixture"',
    );
  });
});
