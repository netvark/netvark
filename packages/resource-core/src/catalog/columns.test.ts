import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  domain,
  table,
} from '../test-support/catalog-builder';
import { contactsCatalog } from '../test-support/contacts';
import { RESOLVE_CASES } from '../test-support/resolve-cases';
import { unenforcedCatalog } from '../test-support/unenforced';
import {
  codecTypeName,
  foreignKeyOf,
  hasWireForm,
  isEnforced,
  isIdentifierColumn,
  isSearchColumn,
  notNullKey,
  primaryKeyColumn,
  resolveColumnType,
} from './columns';

const { tables } = contactsCatalog;

describe('resolveColumnType: the runtime twin of ResolveColumnType', () => {
  it.each(RESOLVE_CASES)('resolves $table.$column', (expected) => {
    const columns: Readonly<
      Record<string, Parameters<typeof resolveColumnType>[1]>
    > = tables[expected.table].columns;
    const resolved = resolveColumnType(
      contactsCatalog,
      columns[expected.column]!,
      'test',
    );
    expect(resolved).toEqual({
      type: expected.type,
      typeKind: expected.typeKind,
      depth: expected.depth,
      domains: expected.domains,
    });
  });

  it('follows a domain over a domain, counting an array domain as one level', () => {
    const catalog = catalogOf(
      {},
      {
        tags: domain('tags', { array: true }),
        short_tags: domain('short_tags', { type: 'tags', typeKind: 'domain' }),
      },
    );
    const resolved = resolveColumnType(
      catalog,
      column({ type: 'short_tags', typeKind: 'domain', array: true }),
      'test',
    );
    expect(resolved).toEqual({
      type: 'text',
      typeKind: 'base',
      depth: 2,
      domains: ['short_tags', 'tags'],
    });
    expect(hasWireForm(resolved)).toBe(false);
  });

  it('throws for a domain the catalog lacks, or one that refers to itself', () => {
    const dangling = column({ type: 'nope', typeKind: 'domain' });
    expect(() =>
      resolveColumnType(catalogOf({}), dangling, 'x.fields.y'),
    ).toThrow(new TypeError('x.fields.y: domain nope is not in the catalog'));
    const cyclic = catalogOf(
      {},
      {
        a: domain('a', { type: 'b', typeKind: 'domain' }),
        b: domain('b', { type: 'a', typeKind: 'domain' }),
      },
    );
    expect(() =>
      resolveColumnType(cyclic, column({ type: 'a', typeKind: 'domain' }), 'x'),
    ).toThrow(new TypeError('x: domain a refers to itself'));
  });
});

const resolve = (overrides: Parameters<typeof column>[0]) =>
  resolveColumnType(catalogOf({}), column(overrides), 'test');

describe('hasWireForm and isIdentifierColumn (SPEC 3.4, 5.1)', () => {
  it('gives scalars, enums, and one-dimensional arrays a wire form, but not JSON arrays', () => {
    expect(hasWireForm(resolve({ type: 'int8' }))).toBe(true);
    expect(
      hasWireForm(resolve({ type: 'mood', typeKind: 'enum', array: true })),
    ).toBe(true);
    expect(hasWireForm(resolve({ type: 'jsonb' }))).toBe(true);
    expect(hasWireForm(resolve({ type: 'jsonb', array: true }))).toBe(false);
    expect(hasWireForm(resolve({ type: 'tstzrange', typeKind: 'range' }))).toBe(
      false,
    );
    expect(
      hasWireForm(resolve({ type: 'address', typeKind: 'composite' })),
    ).toBe(false);
  });

  it('lets only a scalar, non-JSON wire form carry a resource id', () => {
    const catalog = catalogOf({});
    expect(isIdentifierColumn(catalog, column({ type: 'uuid' }), 'x')).toBe(
      true,
    );
    expect(isIdentifierColumn(catalog, column({ type: 'jsonb' }), 'x')).toBe(
      false,
    );
    expect(
      isIdentifierColumn(catalog, column({ type: 'uuid', array: true }), 'x'),
    ).toBe(false);
    expect(isIdentifierColumn(catalog, column({ type: 'macaddr' }), 'x')).toBe(
      false,
    );
  });
});

describe('table lookups', () => {
  it('finds single-column keys only', () => {
    expect(primaryKeyColumn(tables.contacts)).toBe('id');
    expect(primaryKeyColumn(tables.contact_phones)).toBeUndefined();
    expect(primaryKeyColumn(table('t', {}, {}, null))).toBeUndefined();
    expect(
      foreignKeyOf(tables.contacts, 'organization_id')?.references.table,
    ).toBe('organizations');
    expect(foreignKeyOf(tables.contacts, 'name')).toBeUndefined();
  });

  it('recognizes search columns and names NOT NULL keys by the table name, never its schema', () => {
    expect(isSearchColumn(tables.contacts.columns.search)).toBe(true);
    expect(isSearchColumn(tables.contacts.columns.name)).toBe(false);
    expect(notNullKey(tables['audit.changes'], 'payload')).toBe(
      'changes_payload_not_null',
    );
    expect(codecTypeName(tables.contacts.columns.tags)).toBe('text[]');
  });

  it('counts every constraint as enforced but a NOT ENFORCED CHECK or foreign key (catalog ADR 0010)', () => {
    const { constraints } = unenforcedCatalog.tables.imported_contacts;
    expect(
      Object.entries(constraints).map(([name, constraint]) => [
        name,
        isEnforced(constraint),
      ]),
    ).toEqual([
      ['imported_contacts_email_check', false],
      ['imported_contacts_nickname_check', false],
      ['imported_contacts_owner_id_fkey', false],
      ['imported_contacts_pkey', true],
      ['imported_contacts_reachable_check', false],
      ['imported_contacts_score_check', true],
      ['imported_contacts_status_check', false],
    ]);
    // Unique, primary key, CHECK, and foreign key; and exclusion.
    const others = [
      ...Object.values(tables.contacts.constraints),
      ...Object.values(tables.meetings.constraints),
    ];
    expect(others.every((constraint) => isEnforced(constraint))).toBe(true);
  });
});
