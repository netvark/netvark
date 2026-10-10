import type { ZodObject, ZodString } from 'zod';

import type { Codec } from './types';

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import * as zm from 'zod/mini';

import { defineCodec } from './define-codec';

describe('defineCodec types (SPEC 7.1, ADR 0006)', () => {
  it('keeps the literal type names and the schema type', () => {
    const codec = defineCodec({
      types: ['interval', 'interval[]'],
      schema: z.string(),
      fixtures: ['P1D'],
    });
    expectTypeOf(codec).toEqualTypeOf<
      Codec<readonly ['interval', 'interval[]'], ZodString>
    >();
    expectTypeOf(codec.fixtures).toEqualTypeOf<
      readonly [string, ...Array<string>]
    >();
  });

  it('types fixtures by the schema input, not its output', () => {
    const codec = defineCodec({
      types: ['int4range'],
      schema: z.object({ from: z.string().transform(Number) }),
      fixtures: [{ from: '1' }],
    });
    expectTypeOf(codec.schema).toExtend<ZodObject>();
    defineCodec({
      types: ['int4range'],
      schema: z.object({ from: z.string().transform(Number) }),
      // @ts-expect-error a fixture is a wire value, the schema's input
      fixtures: [{ from: 1 }],
    });
  });

  it('accepts a Zod Mini schema', () => {
    defineCodec({ types: ['inet'], schema: zm.string(), fixtures: ['::1'] });
  });

  it('does not compile without fixtures, or with an empty list', () => {
    // @ts-expect-error fixtures are mandatory
    defineCodec({ types: ['interval'], schema: z.string() });
    defineCodec({
      types: ['interval'],
      schema: z.string(),
      // @ts-expect-error at least one fixture
      fixtures: [],
    });
    defineCodec({
      // @ts-expect-error at least one type name
      types: [],
      schema: z.string(),
      fixtures: ['P1D'],
    });
  });

  it('refuses a fixture of another type', () => {
    defineCodec({
      types: ['interval'],
      schema: z.string(),
      // @ts-expect-error a number is not a string
      fixtures: ['P1D', 1],
    });
  });
});
