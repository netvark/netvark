import type { ZodString } from 'zod';

import type { Validator } from './types';

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineValidator } from './define-validator';

describe('defineValidator types (SPEC 7.2, ADR 0006)', () => {
  it('keeps the schema type, and types both lists by its input', () => {
    const validator = defineValidator({
      schema: z.string(),
      fixtures: { accept: ['a'], reject: ['A'] },
    });
    expectTypeOf(validator).toEqualTypeOf<Validator<ZodString>>();
    expectTypeOf(validator.fixtures.reject).toEqualTypeOf<
      readonly [string, ...Array<string>]
    >();
  });

  it('does not compile without both lists, or with an empty one', () => {
    defineValidator({
      schema: z.string(),
      // @ts-expect-error reject fixtures are mandatory
      fixtures: { accept: ['a'] },
    });
    defineValidator({
      schema: z.string(),
      // @ts-expect-error at least one accept fixture
      fixtures: { accept: [], reject: ['A'] },
    });
    // @ts-expect-error fixtures are mandatory
    defineValidator({ schema: z.string() });
  });

  it('refuses a fixture of another type', () => {
    defineValidator({
      schema: z.object({ startsOn: z.string(), endsOn: z.string() }),
      fixtures: {
        accept: [{ startsOn: '2026-01-01', endsOn: '2026-01-02' }],
        // @ts-expect-error endsOn is missing
        reject: [{ startsOn: '2026-01-02' }],
      },
    });
  });
});
