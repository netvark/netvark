/**
 * `toPublicCatalog` and unique indexes (SPEC 3, ADR 0009): a unique index
 * that no constraint backs joins the public constraints, and every other
 * index stays out.
 */
import type { Catalog, CatalogIndex } from './model';
import type { PublicConstraint } from './public-types';

import { describe, expect, it } from 'vitest';

import { toPublicCatalog } from './public';
import { fixture } from './test-support/catalog';
import { contactsTable } from './test-support/contacts-table';
import { deepFreeze } from './test-support/deep-freeze';

const catalog: Catalog = deepFreeze(structuredClone(fixture));

const UNIQUE_INDEX: CatalogIndex = {
  method: 'btree',
  unique: true,
  primary: false,
  nullsDistinct: true,
  columns: [],
  include: [],
  predicate: null,
  definition: '',
};

/** The public constraints of the fixture's contacts table, in `source`. */
function publicConstraints(
  source: Catalog = catalog,
): Readonly<Record<string, PublicConstraint>> {
  return (
    toPublicCatalog(source, ['contacts']).tables['contacts']?.constraints ?? {}
  );
}

/** The public constraints of the fixture's contacts table with these indexes added to it. */
function constraintsWith(
  indexes: Readonly<Record<string, Partial<CatalogIndex>>>,
): Readonly<Record<string, PublicConstraint>> {
  const added = Object.entries(indexes).map(([name, index]) => [
    name,
    { ...UNIQUE_INDEX, ...index },
  ]);
  const contacts = structuredClone(contactsTable);
  const edited: Catalog = {
    ...catalog,
    tables: {
      ...catalog.tables,
      contacts: {
        ...contacts,
        indexes: { ...contacts.indexes, ...Object.fromEntries(added) },
      },
    },
  };
  return publicConstraints(deepFreeze(edited));
}

describe('toPublicCatalog: unique indexes (SPEC 3, ADR 0009)', () => {
  it('lists a unique index that no constraint backs as a unique constraint, after the constraints', () => {
    const constraints = constraintsWith({
      contacts_kind_name_key: {
        columns: ['kind', 'name'],
        nullsDistinct: false,
        definition:
          'CREATE UNIQUE INDEX contacts_kind_name_key ON public.contacts USING btree (kind, name) NULLS NOT DISTINCT',
      },
    });
    expect(Object.keys(constraints)).toEqual([
      ...Object.keys(publicConstraints()),
      'contacts_kind_name_key',
    ]);
    expect(constraints['contacts_kind_name_key']).toEqual({
      kind: 'unique',
      columns: ['kind', 'name'],
      nullsDistinct: false,
      partial: false,
    });
  });

  it('marks a partial unique index partial and drops its predicate and INCLUDE columns', () => {
    const constraints = constraintsWith({
      contacts_person_email: {
        columns: ['email'],
        include: ['name'],
        predicate: "(kind = 'person'::contact_kind)",
        definition:
          "CREATE UNIQUE INDEX contacts_person_email ON public.contacts USING btree (email) INCLUDE (name) WHERE (kind = 'person'::contact_kind)",
      },
    });
    expect(constraints['contacts_person_email']).toEqual({
      kind: 'unique',
      columns: ['email'],
      nullsDistinct: true,
      partial: true,
    });
  });

  it("leaves out the index behind a constraint, which has the constraint's name", () => {
    const constraints = constraintsWith({
      contacts_email_key: {
        columns: ['organization_id', 'email'],
        nullsDistinct: false,
        definition:
          'CREATE UNIQUE INDEX contacts_email_key ON public.contacts USING btree (organization_id, email) NULLS NOT DISTINCT',
      },
      contacts_pkey: {
        primary: true,
        columns: ['id'],
        definition:
          'CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id)',
      },
    });
    expect(constraints).toEqual(publicConstraints());
  });

  it('leaves out a unique index with an expression element, since the public catalog carries no expression', () => {
    const constraints = constraintsWith({
      contacts_lower_email: {
        columns: [null],
        definition:
          'CREATE UNIQUE INDEX contacts_lower_email ON public.contacts USING btree (lower(email))',
      },
      contacts_organization_lower_name: {
        columns: ['organization_id', null],
        definition:
          'CREATE UNIQUE INDEX contacts_organization_lower_name ON public.contacts USING btree (organization_id, lower(name))',
      },
    });
    expect(constraints).toEqual(publicConstraints());
  });

  it('leaves out a unique index named like a CHECK or FOREIGN KEY constraint of its table, which keeps the key', () => {
    const constraints = constraintsWith({
      contacts_name_length: {
        columns: ['name'],
        definition:
          'CREATE UNIQUE INDEX contacts_name_length ON public.contacts USING btree (name)',
      },
      contacts_organization_fk: {
        columns: ['organization_id'],
        definition:
          'CREATE UNIQUE INDEX contacts_organization_fk ON public.contacts USING btree (organization_id)',
      },
    });
    expect(constraints).toEqual(publicConstraints());
  });

  it('leaves out an index that is not unique', () => {
    expect(contactsTable.indexes).toHaveProperty('contacts_name_trgm');
    expect(publicConstraints()).not.toHaveProperty('contacts_name_trgm');
  });
});
