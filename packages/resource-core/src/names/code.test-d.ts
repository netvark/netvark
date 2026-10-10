import type { CODE_CASES } from '../test-support/code-cases';
import type { IsCode } from './code';

import { describe, expectTypeOf, it } from 'vitest';

type Case = (typeof CODE_CASES)[number];

/** A case `IsCode` gets wrong. */
type Mismatch<TCase> = TCase extends readonly [
  infer TCode extends string,
  infer TValid,
]
  ? IsCode<TCode> extends TValid
    ? never
    : TCase
  : never;

describe('IsCode, the type-level twin of isCode (SPEC 4.2, 17)', () => {
  it('matches isCode on every case of the table', () => {
    expectTypeOf<Case>().not.toBeNever();
    expectTypeOf<Mismatch<Case>>().toBeNever();
  });

  it('upper-cases a key as deriveCode does, special casings included', () => {
    expectTypeOf<
      Uppercase<'notes_größe_check'>
    >().toEqualTypeOf<'NOTES_GRÖSSE_CHECK'>();
  });

  it('leaves a code typed only as string to the runtime', () => {
    expectTypeOf<IsCode<string>>().toEqualTypeOf<true>();
  });
});
