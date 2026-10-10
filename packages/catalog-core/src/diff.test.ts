import type { Catalog, CatalogColumn } from './model';

import { describe, expect, it } from 'vitest';

import { diffCatalogs } from './diff';
import { fixture } from './test-support/catalog';

/** A mutable deep copy of the fixture; tests change it to describe the actual catalog. */
function copy(): any {
  return structuredClone(fixture);
}

/** The fixture without index-signature typing, for reading expected values. */
const original: any = fixture;

const notes: CatalogColumn = {
  type: 'text',
  typeKind: 'base',
  array: false,
  sqlType: 'text',
  maxLength: null,
  precision: null,
  scale: null,
  collation: null,
  nullable: true,
  default: null,
  identity: null,
  generated: null,
  comment: null,
};

describe('diffCatalogs: changes (SPEC 4, ADR 0008)', () => {
  it('returns no changes for equal catalogs, whatever their member order', () => {
    const reordered = copy();
    const { audit_log, contacts, organizations } = reordered.tables;
    reordered.tables = { organizations, contacts, audit_log };
    expect(diffCatalogs(fixture, copy())).toEqual({ changes: [] });
    expect(diffCatalogs(fixture, reordered)).toEqual({ changes: [] });
  });

  it('reports a member only the actual catalog has as added, with its whole value', () => {
    const actual = copy();
    actual.tables.contacts.columns.notes = notes;
    expect(diffCatalogs(fixture, actual).changes).toEqual([
      {
        kind: 'added',
        path: ['tables', 'contacts', 'columns', 'notes'],
        actual: notes,
      },
    ]);
  });

  it('reports a member only the expected catalog has as removed, with its whole value', () => {
    const actual = copy();
    delete actual.tables.contacts.rowSecurity.policies.contacts_tenant;
    expect(diffCatalogs(fixture, actual).changes).toEqual([
      {
        kind: 'removed',
        path: [
          'tables',
          'contacts',
          'rowSecurity',
          'policies',
          'contacts_tenant',
        ],
        expected: original.tables.contacts.rowSecurity.policies.contacts_tenant,
      },
    ]);
  });

  it('reports a changed scalar at its full path', () => {
    const actual = copy();
    actual.tables.contacts.constraints.contacts_name_length.definition =
      'CHECK ((char_length(name) <= 300))';
    expect(diffCatalogs(fixture, actual).changes).toEqual([
      {
        kind: 'changed',
        path: [
          'tables',
          'contacts',
          'constraints',
          'contacts_name_length',
          'definition',
        ],
        expected:
          original.tables.contacts.constraints.contacts_name_length.definition,
        actual: 'CHECK ((char_length(name) <= 300))',
      },
    ]);
  });

  it('compares arrays as values: an enum that gained a label is one change holding both lists', () => {
    const actual = copy();
    actual.enums.contact_kind = ['person', 'company', 'team'];
    expect(diffCatalogs(fixture, actual).changes).toEqual([
      {
        kind: 'changed',
        path: ['enums', 'contact_kind'],
        expected: ['person', 'company'],
        actual: ['person', 'company', 'team'],
      },
    ]);
  });

  it('reports a member that became null as one change of the whole value', () => {
    const actual = copy();
    actual.domains.phone_kind_code.default = null;
    expect(diffCatalogs(fixture, actual).changes).toEqual([
      {
        kind: 'changed',
        path: ['domains', 'phone_kind_code', 'default'],
        expected: { expression: "'mobile'::phone_kind", literal: 'mobile' },
        actual: null,
      },
    ]);
  });
});

describe('diffCatalogs: order and contract', () => {
  it('lists changes depth first: the expected members in order, then the members only actual has', () => {
    const actual = copy();
    actual.extensions = ['pg_trgm', 'pgcrypto'];
    actual.enums.zeta = ['z'];
    delete actual.domains.tag;
    actual.tables = {
      aaa_first: actual.tables.organizations,
      ...actual.tables,
    };
    expect(
      diffCatalogs(fixture, actual).changes.map((change) => [
        change.kind,
        change.path.join('.'),
      ]),
    ).toEqual([
      ['changed', 'extensions'],
      ['added', 'enums.zeta'],
      ['removed', 'domains.tag'],
      ['added', 'tables.aaa_first'],
    ]);
  });

  it('throws TypeError for catalogs of different formats, whose members are not comparable', () => {
    const actual = copy();
    actual.format = 4;
    expect(() => diffCatalogs(fixture, actual as Catalog)).toThrow(
      new TypeError('cannot compare catalogs of format 3 and 4'),
    );
  });

  it('throws TypeError naming a member that is not JSON data', () => {
    const actual = copy();
    actual.tables.contacts.comment = undefined;
    expect(() => diffCatalogs(fixture, actual as Catalog)).toThrow(
      new TypeError(
        'catalog member ["tables","contacts","comment"] is not JSON data',
      ),
    );
  });

  it('leaves both catalogs untouched', () => {
    const expected = copy();
    const actual = copy();
    actual.enums.zeta = ['z'];
    const before = structuredClone(actual);
    diffCatalogs(expected, actual);
    expect(expected).toEqual(fixture);
    expect(actual).toEqual(before);
  });
});
