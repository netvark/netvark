import type { CatalogChange, CatalogDiff } from './diff';
import type { JsonValue } from './internal/json';
import type { Catalog, CATALOG_FORMAT } from './model';
import type { PublicCatalog } from './public-types';

import { describe, expectTypeOf, it } from 'vitest';

import { diffCatalogs } from './diff';
import { toPublicCatalog } from './public';

/** A one-table catalog exactly as the renderer declares it: JSON under `as const`. */
const generated = {
  format: 2,
  schemas: ['public'],
  extensions: [],
  enums: { contact_kind: ['person', 'company'] },
  domains: {},
  tables: {
    contacts: {
      schema: 'public',
      name: 'contacts',
      comment: null,
      primaryKey: ['id'],
      columns: {
        id: {
          type: 'uuid',
          typeKind: 'base',
          array: false,
          sqlType: 'uuid',
          maxLength: null,
          precision: null,
          scale: null,
          collation: null,
          nullable: false,
          default: { expression: 'gen_random_uuid()', literal: null },
          identity: null,
          generated: null,
          comment: null,
        },
      },
      constraints: {
        contacts_name_length: {
          kind: 'check',
          columns: ['name'],
          expression:
            '((char_length(name) >= 1) AND (char_length(name) <= 200))',
          rule: { kind: 'length', min: 1, max: 200 },
          validated: true,
          enforced: true,
          definition:
            'CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)))',
        },
      },
      indexes: {},
      rowSecurity: { enabled: false, forced: false, policies: {} },
    },
  },
} as const;

describe('model types (SPEC 2, ADR 0004)', () => {
  it('accepts a generated catalog literal, declared as const', () => {
    expectTypeOf(generated).toExtend<Catalog>();
  });

  it('keeps the literal types a declaration library infers from', () => {
    expectTypeOf(
      generated.tables.contacts.constraints.contacts_name_length.rule,
    ).toEqualTypeOf<{
      readonly kind: 'length';
      readonly min: 1;
      readonly max: 200;
    }>();
    expectTypeOf(generated.enums.contact_kind).toEqualTypeOf<
      readonly ['person', 'company']
    >();
  });

  it('pins the format to the literal type of CATALOG_FORMAT', () => {
    expectTypeOf<Catalog['format']>().toEqualTypeOf<typeof CATALOG_FORMAT>();
    expectTypeOf<PublicCatalog['format']>().toEqualTypeOf<2>();
  });

  it('types the public slice as PublicCatalog', () => {
    expectTypeOf(toPublicCatalog).returns.toEqualTypeOf<PublicCatalog>();
  });

  it('accepts a generated literal on both sides of a diff', () => {
    expectTypeOf(diffCatalogs).toBeCallableWith(generated, generated);
    expectTypeOf(diffCatalogs).returns.toEqualTypeOf<CatalogDiff>();
  });

  it('narrows a change by kind to the values it carries (SPEC 4)', () => {
    expectTypeOf<Extract<CatalogChange, { kind: 'added' }>>()
      .toHaveProperty('actual')
      .toEqualTypeOf<JsonValue>();
    expectTypeOf<
      Extract<CatalogChange, { kind: 'removed' }>
    >().not.toHaveProperty('actual');
    expectTypeOf<Extract<CatalogChange, { kind: 'changed' }>>()
      .toHaveProperty('expected')
      .toEqualTypeOf<JsonValue>();
  });
});
