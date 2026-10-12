import type { ContactsCatalog as Catalog } from '../test-support/contacts';
import type { IdSpelling } from './id-spelling';

import { describe, expectTypeOf, it } from 'vitest';

type Tables = Catalog['tables'];
type Contacts = Tables['contacts']['columns'];
type Organizations = Tables['organizations']['columns'];

/** The cases `id-spelling.test.ts` runs on `idSpelling`, on the typed catalog. */
describe('IdSpelling: the type-level twin of idSpelling', () => {
  it('spells a bpchar with its length', () => {
    expectTypeOf<
      IdSpelling<Catalog, Tables['badges']['columns']['code']>
    >().toEqualTypeOf<'bpchar(6)'>();
    expectTypeOf<
      IdSpelling<Catalog, Tables['badge_awards']['columns']['badge_id']>
    >().toEqualTypeOf<'bpchar(4)'>();
  });

  it("takes a domain's modifiers, and spells a numeric with its scale", () => {
    expectTypeOf<
      IdSpelling<Catalog, Contacts['discount']>
    >().toEqualTypeOf<'numeric(2)'>();
    expectTypeOf<
      IdSpelling<Catalog, Contacts['email']>
    >().toEqualTypeOf<'citext'>();
  });

  it('spells the integers alike, and text and varchar alike', () => {
    expectTypeOf<
      IdSpelling<Catalog, Contacts['priority']>
    >().toEqualTypeOf<'integer'>();
    expectTypeOf<
      IdSpelling<Catalog, Organizations['id']>
    >().toEqualTypeOf<'integer'>();
    expectTypeOf<
      IdSpelling<Catalog, Organizations['slug']>
    >().toEqualTypeOf<'text'>();
    expectTypeOf<
      IdSpelling<Catalog, Organizations['name']>
    >().toEqualTypeOf<'text'>();
  });

  it('spells every other type by its name', () => {
    expectTypeOf<IdSpelling<Catalog, Contacts['id']>>().toEqualTypeOf<'uuid'>();
    expectTypeOf<
      IdSpelling<Catalog, Contacts['kind']>
    >().toEqualTypeOf<'contact_kind'>();
  });
});
