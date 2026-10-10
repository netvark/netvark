import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as zm from 'zod/mini';
import { $ZodError } from 'zod/v4/core';

import { typeErrorOf } from '../test-support/failure';
import { defineCodec, isCodec } from './define-codec';

/** `defineCodec` with its types erased, as JavaScript calls it. */
const defineUntyped = defineCodec as unknown as (init: unknown) => unknown;

const valid = {
  types: ['interval'],
  schema: z.string().regex(/^P/u),
  fixtures: ['P1D', 'PT2H'],
} as const;

describe('defineCodec (SPEC 7.1)', () => {
  it('returns a frozen codec that holds copies of its lists', () => {
    const types = ['interval', 'interval[]'] as const;
    const fixtures = ['P1D'] as const;
    const codec = defineCodec({
      types,
      schema: valid.schema,
      fixtures,
      description: 'An ISO 8601 duration.',
    });
    expect(isCodec(codec)).toBe(true);
    expect(codec).toEqual({
      types: ['interval', 'interval[]'],
      schema: valid.schema,
      fixtures: ['P1D'],
      description: 'An ISO 8601 duration.',
    });
    expect(Object.isFrozen(codec)).toBe(true);
    expect(Object.isFrozen(codec.types)).toBe(true);
    expect(Object.isFrozen(codec.fixtures)).toBe(true);
    expect(codec.types).not.toBe(types);
  });

  it('leaves description undefined when it is omitted', () => {
    expect(defineCodec(valid).description).toBeUndefined();
  });

  it('accepts a Zod Mini schema, which shares Zod Core', () => {
    const codec = defineCodec({
      types: ['inet'],
      schema: zm.string().check(zm.minLength(2)),
      fixtures: ['::1'],
    });
    expect(isCodec(codec)).toBe(true);
  });

  it('brands only what it returned', () => {
    expect(isCodec({ ...defineCodec(valid) })).toBe(false);
    expect(isCodec(null)).toBe(false);
    expect(isCodec('codec')).toBe(false);
  });

  it('refuses types that are not a non-empty list of type names', () => {
    for (const types of [[], [1], [''], 'interval', undefined]) {
      expect(typeErrorOf(() => defineUntyped({ ...valid, types }))).toBe(
        'defineCodec.types: must be a non-empty list of type names',
      );
    }
  });

  it('refuses a schema that is not a Zod 4 schema', () => {
    const standardSchemaOnly = {
      '~standard': { version: 1, vendor: 'other', validate: () => ({}) },
    };
    for (const schema of [standardSchemaOnly, undefined, 'string']) {
      expect(typeErrorOf(() => defineUntyped({ ...valid, schema }))).toBe(
        'defineCodec.schema: must be a Zod 4 schema (zod or zod/mini)',
      );
    }
  });

  it('refuses fixtures that are missing or empty', () => {
    for (const fixtures of [[], undefined, 'P1D']) {
      expect(typeErrorOf(() => defineUntyped({ ...valid, fixtures }))).toBe(
        'defineCodec.fixtures: must be a non-empty list of values',
      );
    }
  });

  it('names the fixture the schema rejects, with the Zod error as its cause', () => {
    let thrown: unknown;
    try {
      defineUntyped({ ...valid, fixtures: ['P1D', '1 day'] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as TypeError).message).toBe(
      'defineCodec.fixtures[1]: the schema rejects this fixture',
    );
    expect((thrown as TypeError).cause).toBeInstanceOf($ZodError);
  });

  it('refuses a schema that parses asynchronously', () => {
    /** A refinement that awaits, as a lookup in another service would. */
    const schema = z.string().refine(async (value) => {
      await Promise.resolve();
      return value !== '';
    });
    expect(typeErrorOf(() => defineUntyped({ ...valid, schema }))).toBe(
      'defineCodec.schema: must parse synchronously',
    );
  });

  it('refuses a schema that accepts undefined or null, which the column decides (SPEC 6.1, 6.2)', () => {
    for (const schema of [
      z.string().optional(),
      z.string().default('P1D'),
      z.string().prefault('P1D'),
      z.string().catch('P1D'),
      zm.optional(zm.string()),
    ]) {
      expect(typeErrorOf(() => defineUntyped({ ...valid, schema }))).toBe(
        'defineCodec.schema: must reject undefined, so a member a client leaves out stays out',
      );
    }
    expect(
      typeErrorOf(() =>
        defineUntyped({ ...valid, schema: z.string().nullable() }),
      ),
    ).toBe(
      "defineCodec.schema: must reject null; the column's nullability decides null",
    );
  });

  it('lets an error the schema itself throws pass through', () => {
    const failing = new RangeError('the refinement failed');
    const schema = z.string().refine(() => {
      throw failing;
    });
    expect(() => defineUntyped({ ...valid, schema })).toThrow(failing);
  });

  it('refuses an unknown member, a non-string description, and a non-object', () => {
    expect(
      typeErrorOf(() => defineUntyped({ ...valid, fixture: ['P1D'] })),
    ).toBe('defineCodec: unknown member "fixture"');
    expect(typeErrorOf(() => defineUntyped({ ...valid, description: 1 }))).toBe(
      'defineCodec.description: must be a string, received 1',
    );
    expect(typeErrorOf(() => defineUntyped(null))).toBe(
      'defineCodec: must be an object, received null',
    );
  });
});
