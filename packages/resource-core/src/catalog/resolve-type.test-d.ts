import type { ContactsCatalog as Catalog } from '../test-support/contacts';
import type {
  CodecTypeName,
  HasWireForm,
  ResolveColumnType,
} from './resolve-type';

import { describe, expectTypeOf, it } from 'vitest';

type Contacts = Catalog['tables']['contacts']['columns'];
type Meetings = Catalog['tables']['meetings']['columns'];

/** The cases of `RESOLVE_CASES` (`test-support/resolve-cases.ts`), which `columns.test.ts` runs. */
describe('ResolveColumnType: the type-level twin of resolveColumnType', () => {
  it('follows a column through its domains to the base type', () => {
    expectTypeOf<ResolveColumnType<Catalog, Contacts['name']>>().toEqualTypeOf<{
      readonly type: 'text';
      readonly typeKind: 'base';
      readonly depth: 0;
      readonly domains: [];
    }>();
    expectTypeOf<
      ResolveColumnType<Catalog, Contacts['email']>
    >().toEqualTypeOf<{
      readonly type: 'citext';
      readonly typeKind: 'base';
      readonly depth: 0;
      readonly domains: ['email'];
    }>();
    expectTypeOf<
      ResolveColumnType<Catalog, Meetings['attendees']>
    >().toEqualTypeOf<{
      readonly type: 'citext';
      readonly typeKind: 'base';
      readonly depth: 1;
      readonly domains: ['email'];
    }>();
    expectTypeOf<
      ResolveColumnType<Catalog, Contacts['kind']>['typeKind']
    >().toEqualTypeOf<'enum'>();
    expectTypeOf<
      ResolveColumnType<Catalog, Meetings['during']>['typeKind']
    >().toEqualTypeOf<'range'>();
  });

  it('decides wire forms as hasWireForm does', () => {
    expectTypeOf<
      HasWireForm<Catalog, Contacts['name']>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasWireForm<Catalog, Contacts['kind']>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasWireForm<Catalog, Contacts['tags']>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasWireForm<Catalog, Meetings['attendees']>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasWireForm<Catalog, Meetings['during']>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasWireForm<Catalog, Contacts['search']>
    >().toEqualTypeOf<false>();
  });

  it('names a column for a codec by its type, with [] for an array', () => {
    expectTypeOf<CodecTypeName<Contacts['tags']>>().toEqualTypeOf<'text[]'>();
    expectTypeOf<CodecTypeName<Contacts['email']>>().toEqualTypeOf<'email'>();
  });
});
