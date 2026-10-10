import type { Catalog } from './model';
import type { PublicColumn, PublicTable } from './public-types';

import { describe, expect, it } from 'vitest';

import { toPublicCatalog } from './public';
import { fixture } from './test-support/catalog';
import { deepFreeze } from './test-support/deep-freeze';

const catalog: Catalog = deepFreeze(structuredClone(fixture));

function contactsTable(): PublicTable {
  const table = toPublicCatalog(catalog, ['contacts']).tables['contacts'];
  if (table === undefined) {
    throw new Error('contacts missing');
  }
  return table;
}

function contactsColumn(name: string): PublicColumn | undefined {
  return contactsTable().columns[name];
}

describe('toPublicCatalog: tables (SPEC 3, ADR 0005)', () => {
  it('keeps only the listed tables, in the catalog order rather than the list order', () => {
    const result = toPublicCatalog(catalog, ['organizations', 'contacts']);
    expect(Object.keys(result.tables)).toEqual(['contacts', 'organizations']);
    expect(result.format).toBe(2);
  });

  it('drops the comment, the indexes, and row security of a table', () => {
    const contacts = contactsTable();
    expect(Object.keys(contacts)).toEqual([
      'schema',
      'name',
      'primaryKey',
      'columns',
      'constraints',
    ]);
    expect(contacts.primaryKey).toEqual(['id']);
  });

  it('keeps the facts a form needs per column and drops collation, comment, and expressions', () => {
    expect(contactsColumn('name')).toEqual({
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    });
    expect(Object.keys(contactsColumn('name') ?? {})).toEqual([
      'type',
      'typeKind',
      'array',
      'sqlType',
      'maxLength',
      'precision',
      'scale',
      'nullable',
      'default',
      'identity',
      'generated',
    ]);
  });

  it('keeps a default as its literal only, so an expression default reads { literal: null }', () => {
    expect(contactsColumn('kind')?.default).toEqual({ literal: 'person' });
    expect(contactsColumn('id')?.default).toEqual({ literal: null });
  });

  it('keeps a generated column as its kind and text search configuration', () => {
    expect(contactsColumn('search')?.generated).toEqual({
      kind: 'stored',
      searchConfig: 'simple',
    });
  });

  it('keeps each constraint kind with its own public members only', () => {
    expect(contactsTable().constraints).toEqual({
      contacts_email_key: {
        kind: 'unique',
        columns: ['organization_id', 'email'],
        nullsDistinct: false,
        partial: false,
      },
      contacts_name_length: {
        kind: 'check',
        columns: ['name'],
        rule: { kind: 'length', min: 1, max: 200 },
      },
      contacts_no_overlap: { kind: 'exclusion', columns: ['organization_id'] },
      contacts_organization_fk: {
        kind: 'foreignKey',
        columns: ['organization_id'],
        references: { table: 'organizations', columns: ['id'] },
      },
      contacts_pkey: { kind: 'primaryKey', columns: ['id'] },
    });
  });
});

describe('toPublicCatalog: enums and domains (SPEC 3)', () => {
  it('holds the enums and domains the kept columns use, directly, through domains, and in arrays', () => {
    const result = toPublicCatalog(catalog, ['contacts']);
    // contact_kind directly; phone_kind through the phone_kind_code domain;
    // short_text through tag, a domain over a domain used as an array.
    expect(Object.keys(result.enums)).toEqual(['contact_kind', 'phone_kind']);
    expect(Object.keys(result.domains)).toEqual([
      'email',
      'phone_kind_code',
      'short_text',
      'tag',
    ]);
  });

  it('leaves out the enums and domains only private tables use', () => {
    const result = toPublicCatalog(catalog, ['contacts']);
    expect(result.enums).not.toHaveProperty('audit_action');
    expect(result.domains).not.toHaveProperty('retention');
    expect(toPublicCatalog(catalog, ['audit_log']).domains).toHaveProperty(
      'retention',
    );
  });

  it('drops collation, comment, and expressions from a domain and keeps its rules', () => {
    const { domains } = toPublicCatalog(catalog, ['contacts']);
    expect(domains['email']).toEqual({
      schema: 'public',
      name: 'email',
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      constraints: {
        email_check: {
          kind: 'check',
          rule: { kind: 'pattern', source: '^[^@]+@[^@]+$', flags: 'su' },
        },
      },
    });
    expect(domains['phone_kind_code']?.default).toEqual({ literal: 'mobile' });
  });

  it('decides membership by type kind, so a base type never pulls in an enum of the same name', () => {
    const shadowed: Catalog = {
      ...catalog,
      enums: { ...catalog.enums, text: ['a', 'b'] },
    };
    expect(toPublicCatalog(shadowed, ['contacts']).enums).not.toHaveProperty(
      'text',
    );
  });

  it('returns empty enums and domains when the list is empty', () => {
    expect(toPublicCatalog(catalog, [])).toEqual({
      format: 2,
      enums: {},
      domains: {},
      tables: {},
    });
  });
});

describe('toPublicCatalog: input checks and purity', () => {
  it('throws TypeError for a table the catalog does not hold', () => {
    expect(() => toPublicCatalog(catalog, ['contact'])).toThrow(
      new TypeError('public table "contact" is not in the catalog'),
    );
  });

  it('throws TypeError for an inherited property name, which is not a table', () => {
    expect(() => toPublicCatalog(catalog, ['toString'])).toThrow(TypeError);
  });

  it('throws TypeError for a table listed twice', () => {
    expect(() => toPublicCatalog(catalog, ['contacts', 'contacts'])).toThrow(
      new TypeError('public table "contacts" is listed twice'),
    );
  });

  it('throws TypeError for a constraint kind outside the model, as in a hand-edited catalog', () => {
    const edited = structuredClone(fixture) as unknown as {
      tables: { contacts: { constraints: Record<string, unknown> } };
    };
    edited.tables.contacts.constraints['contacts_odd'] = {
      kind: 'trigger',
      columns: [],
    };
    expect(() =>
      toPublicCatalog(edited as unknown as Catalog, ['contacts']),
    ).toThrow(
      new TypeError('unknown constraint kind: {"kind":"trigger","columns":[]}'),
    );
  });

  it('is a pure function of its inputs: equal results, and the frozen input is never written', () => {
    const first = toPublicCatalog(catalog, ['contacts', 'audit_log']);
    const second = toPublicCatalog(structuredClone(fixture), [
      'audit_log',
      'contacts',
    ]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
