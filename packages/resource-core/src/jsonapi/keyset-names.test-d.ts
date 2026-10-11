import type {
  FIELD_NAME_CASES,
  SEARCH_CONFIG_CASES,
} from '../test-support/keyset-name-cases';
import type { IsFieldName, IsSearchConfig } from './keyset-names';

import { describe, expectTypeOf, it } from 'vitest';

/** A case `IsFieldName` gets wrong. */
type FieldNameMismatch<TCase> = TCase extends readonly [
  infer TName extends string,
  infer TValid,
]
  ? IsFieldName<TName> extends TValid
    ? never
    : TCase
  : never;

/** A case `IsSearchConfig` gets wrong. */
type SearchConfigMismatch<TCase> = TCase extends readonly [
  infer TName extends string,
  infer TValid,
]
  ? IsSearchConfig<TName> extends TValid
    ? never
    : TCase
  : never;

describe('IsFieldName and IsSearchConfig, the twins of keyset-core (SPEC 11.2)', () => {
  it('match isFieldName and isSearchConfig on every case of the tables', () => {
    expectTypeOf<(typeof FIELD_NAME_CASES)[number]>().not.toBeNever();
    expectTypeOf<
      FieldNameMismatch<(typeof FIELD_NAME_CASES)[number]>
    >().toBeNever();
    expectTypeOf<(typeof SEARCH_CONFIG_CASES)[number]>().not.toBeNever();
    expectTypeOf<
      SearchConfigMismatch<(typeof SEARCH_CONFIG_CASES)[number]>
    >().toBeNever();
  });

  it('leave a name typed only as string to the runtime', () => {
    expectTypeOf<IsFieldName<string>>().toEqualTypeOf<true>();
    expectTypeOf<IsSearchConfig<string>>().toEqualTypeOf<true>();
  });
});
