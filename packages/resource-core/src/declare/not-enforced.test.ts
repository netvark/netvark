/**
 * NOT ENFORCED constraints (catalog ADR 0010; SPEC 3.5, 6.1, 8, 9.1).
 * PostgreSQL 18 stores values that break them, so the schemas accept those
 * values, the field metadata states none of their rules, no validator
 * covers them, and they derive no error code. An unenforced foreign key
 * still declares a relationship. The compile-time twins are in
 * `not-enforced.test-d.ts` and `meta/field-meta.test-d.ts`.
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html (`NOT ENFORCED`)
 */
import type { ResourceIssue } from '../schema/issues';

import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { TEST_REGISTRIES } from '../test-support/definer';
import { typeErrorOf } from '../test-support/failure';
import { unenforcedCatalog } from '../test-support/unenforced';
import { createDeclareResource } from './create-declare-resource';

const declareResource = createDeclareResource({
  catalog: unenforcedCatalog,
  validators: TEST_REGISTRIES.validators,
});

const Owners = declareResource('owners', { operations: ['get'], fields: {} });

const ImportedContacts = declareResource('imported_contacts', {
  operations: ['get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    status: { access: 'readWrite' },
    score: { access: 'readWrite' },
  },
  relationships: {
    owner_id: { target: () => Owners, access: 'readWrite' },
  },
});

const untyped = untypedDeclare(unenforcedCatalog);
const OWNER = '3f1c2b9e-6a4d-4f0e-8b7a-5c2d1e0f9a84';

/** Declares imported_contacts writing every column, with `rules`. */
const withRules = (rules: object) => () =>
  untyped('imported_contacts', {
    operations: ['create'],
    fields: {
      name: { access: 'readWrite' },
      email: { access: 'readWrite' },
      status: { access: 'readWrite' },
    },
    relationships: {
      owner_id: { target: () => Owners, access: 'readWrite' },
    },
    rules,
  });

/** The issues of a create as `[code, path, expected]`; a range rule reports its kind and bound (SPEC 6.4). */
function createIssues(value: unknown): ReadonlyArray<ReadonlyArray<unknown>> {
  const result = ImportedContacts.write.create['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new TypeError('expected a synchronous validation');
  }
  const issues: ReadonlyArray<ResourceIssue> = result.issues ?? [];
  return issues.map(({ code, path, expected }) => [
    code,
    path.join('/'),
    expected,
  ]);
}

describe('NOT ENFORCED: schemas (SPEC 6.1)', () => {
  it('accepts what the database stores against an unenforced CHECK, a rule on it included', () => {
    const stored = {
      name: 'Ada',
      nickname: null,
      email: 'not an address',
      status: 'deleted',
    };
    expect(ImportedContacts.schema.create.parse(stored)).toEqual(stored);
    expect(ImportedContacts.schema.update.parse(stored)).toEqual(stored);
    expect(
      ImportedContacts.schema.read.parse({ ...stored, score: null }),
    ).toEqual({ ...stored, score: null });
  });

  it('leaves a column nullable and optional on create when only an unenforced CHECK forbids NULL', () => {
    expect(ImportedContacts.schema.create.parse({ name: 'Ada' })).toEqual({
      name: 'Ada',
    });
  });

  it('still applies the rule of the enforced CHECK', () => {
    expect(
      createIssues({
        attributes: { name: 'Ada', score: 101 },
        relationships: {},
      }),
    ).toEqual([['maximum', 'attributes/score', '100']]);
  });

  it('accepts a dangling owner, and neither email nor owner, against the unenforced foreign key and multi-column CHECK', () => {
    expect(
      createIssues({
        attributes: { name: 'Ada' },
        relationships: { owner: { type: 'owners', id: OWNER } },
      }),
    ).toEqual([]);
    expect(
      createIssues({
        attributes: { name: 'Ada', email: null },
        relationships: { owner: null },
      }),
    ).toEqual([]);
  });
});

describe('NOT ENFORCED: field metadata (SPEC 8)', () => {
  it('states the rules of the enforced CHECK only', () => {
    const { fields } = ImportedContacts;
    expect(fields.nickname).toMatchObject({ nullable: true, required: false });
    expect(fields.email.limits.patterns).toEqual([]);
    expect(fields.status.options).toBeNull();
    expect(fields.score.limits).toMatchObject({ minimum: '0', maximum: '100' });
    expect(fields.owner).toMatchObject({ target: 'owners', nullable: true });
  });
});

describe('NOT ENFORCED: validators (SPEC 3.5)', () => {
  it('needs no validator for an unenforced CHECK without a rule over a written column', () => {
    expect(withRules({})).not.toThrow();
  });

  it('refuses a validator on an unenforced CHECK, with or without a rule, over one column or several', () => {
    for (const key of [
      'imported_contacts_email_check',
      'imported_contacts_status_check',
      'imported_contacts_reachable_check',
    ]) {
      expect(typeErrorOf(withRules({ [key]: { validator: 'email' } }))).toBe(
        `imported_contacts.rules.${key}.validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it`,
      );
    }
  });
});

describe('NOT ENFORCED: codes (SPEC 9.1)', () => {
  it('derives no code for an unenforced CHECK or foreign key', () => {
    expect(Object.keys(ImportedContacts.errors)).toEqual([
      'IMPORTED_CONTACTS_SCORE_CHECK',
      'IMPORTED_CONTACTS_NAME_NOT_NULL',
    ]);
    expect([...ImportedContacts.names.rules.keys()]).toEqual([
      'imported_contacts_score_check',
      'imported_contacts_name_not_null',
    ]);
  });

  it('refuses code on an unenforced CHECK or foreign key', () => {
    for (const key of [
      'imported_contacts_email_check',
      'imported_contacts_owner_id_fkey',
    ]) {
      expect(typeErrorOf(withRules({ [key]: { code: 'IMPORT_FAILED' } }))).toBe(
        `imported_contacts.rules.${key}.code: the key has no code, since clients cannot violate it`,
      );
    }
  });
});

describe('NOT ENFORCED: relationships (SPEC 3.1)', () => {
  it('declares a relationship over an unenforced foreign key', () => {
    expect(ImportedContacts.names.relationships.get('owner')).toBe('owner_id');
    expect(
      ImportedContacts.linkage.create.parse({
        owner: { type: 'owners', id: OWNER },
      }),
    ).toEqual({ owner: { type: 'owners', id: OWNER } });
  });
});
