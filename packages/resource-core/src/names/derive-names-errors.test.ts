import { describe, expect, it } from 'vitest';

import { DIVERGENT_COLUMNS } from '../test-support/camel-cases';
import { untypedDeclare } from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';
import { namesCatalog } from '../test-support/names';

const declare = untypedDeclare(namesCatalog);
const target = (): undefined => undefined;

/** A `notes` declaration that gets, with the given members. */
const notes = (members: object) => () =>
  declare('notes', { operations: ['get'], fields: {}, ...members });

describe('deriveNames: the type (SPEC 4.2, 14)', () => {
  it('needs as for a table whose name is not a member name or is a member of Object.prototype', () => {
    const declaration = { operations: ['get'], fields: {} };
    expect(typeErrorOf(() => declare('legacy$notes', declaration))).toBe(
      'legacy$notes: the type "legacy$notes" is not a JSON:API member name; set as',
    );
    expect(typeErrorOf(() => declare('constructor', declaration))).toBe(
      'constructor: the type "constructor" is a member of Object.prototype; set as',
    );
    const legacy = declare('legacy$notes', {
      ...declaration,
      as: 'legacyNotes',
    });
    expect(legacy.names.type).toBe('legacyNotes');
  });

  it('checks as like a derived type, and lets a type be a resource object member name', () => {
    expect(typeErrorOf(notes({ as: 'notes!' }))).toBe(
      'notes.as: "notes!" is not a JSON:API member name',
    );
    expect(typeErrorOf(notes({ as: 'prototype' }))).toBe(
      'notes.as: "prototype" is a member of Object.prototype',
    );
    expect(notes({ as: 'type' })().names.type).toBe('type');
  });
});

/** `[title, members, message]` for each name a member cannot take. */
const MEMBER_ERRORS: ReadonlyArray<readonly [string, object, string]> = [
  [
    'a column called type',
    { fields: { type: { access: 'read' } } },
    'notes.fields.type: public name "type" is a member of every resource object; set as',
  ],
  [
    'a column called lid',
    { fields: { lid: { access: 'read' } } },
    'notes.fields.lid: public name "lid" is a member of every resource object; set as',
  ],
  [
    'a column called constructor',
    { fields: { constructor: { access: 'read' } } },
    'notes.fields.constructor: public name "constructor" is a member of Object.prototype; set as',
  ],
  [
    'a derived name with a leading _',
    { fields: { _tmp: { access: 'read' } } },
    'notes.fields._tmp: public name "_Tmp" is not a JSON:API member name; set as',
  ],
  [
    'a derived name with a reserved character',
    { fields: { price$: { access: 'read' } } },
    'notes.fields.price$: public name "price$" is not a JSON:API member name; set as',
  ],
  [
    'a given name that is a resource object member',
    { fields: { contact: { access: 'read', as: 'id' } } },
    'notes.fields.contact.as: "id" is a member of every resource object',
  ],
  [
    'a given name that is not a member name',
    { fields: { contact: { access: 'read', as: 'a.b' } } },
    'notes.fields.contact.as: "a.b" is not a JSON:API member name',
  ],
  [
    'two fields that derive one name',
    { fields: { body_text: { access: 'read' }, bodyText: { access: 'read' } } },
    'notes.fields.bodyText: public name "bodyText" collides with fields.body_text; set as',
  ],
  [
    'a relationship that derives the name of a field (a foo_id next to a foo)',
    {
      fields: { contact: { access: 'read' } },
      relationships: { contact_id: { target, access: 'read' } },
    },
    'notes.relationships.contact_id: public name "contact" collides with fields.contact; set as',
  ],
  [
    'two given names that coincide',
    {
      fields: {
        contact: { access: 'read', as: 'kind' },
        type: { access: 'read', as: 'kind' },
      },
    },
    'notes.fields.type.as: "kind" collides with fields.contact',
  ],
  [
    'a relationship given the name of a field',
    {
      fields: { contact: { access: 'read' } },
      relationships: { author: { target, access: 'read', as: 'contact' } },
    },
    'notes.relationships.author.as: "contact" collides with fields.contact',
  ],
  [
    'a relationship column without _id',
    { relationships: { author: { target, access: 'read' } } },
    'notes.relationships.author: the column does not end in _id; set as',
  ],
];

describe('deriveNames: fields and relationships (SPEC 4.1, 4.2, 14)', () => {
  it.each(MEMBER_ERRORS)('refuses %s', (_title, members, message) => {
    expect(typeErrorOf(notes(members))).toBe(message);
  });

  it.each(DIVERGENT_COLUMNS)(
    'refuses %j, whose camelCase TypeScript and the runtime disagree on, until as names it',
    (column) => {
      const members = (field: object) => ({
        fields: { [column]: { access: 'read', ...field } },
      });
      const catalog = {
        ...namesCatalog,
        tables: {
          notes: {
            ...namesCatalog.tables.notes,
            columns: {
              ...namesCatalog.tables.notes.columns,
              [column]: namesCatalog.tables.notes.columns.contact,
            },
          },
        },
      };
      const declareOver = untypedDeclare(catalog);
      const run = (field: object) => () =>
        declareOver('notes', { operations: ['get'], ...members(field) });
      expect(typeErrorOf(run({}))).toBe(
        `notes.fields.${column}: a letter outside the Basic Multilingual Plane follows _, which Kysely's CamelCasePlugin leaves as is and TypeScript upper-cases; set as`,
      );
      expect(run({ as: 'named' })().names.fields.get('named')).toBe(column);
    },
  );
});

/** `[title, fields, message]` for each pair of `addresses` columns that derive one name. */
const MERGED_COLUMNS: ReadonlyArray<readonly [string, object, string]> = [
  [
    '_ before a digit',
    { line_1: { access: 'read' }, line1: { access: 'read' } },
    'addresses.fields.line1: public name "line1" collides with fields.line_1; set as',
  ],
  [
    '__',
    { street__name: { access: 'read' }, street_name: { access: 'read' } },
    'addresses.fields.street_name: public name "streetName" collides with fields.street__name; set as',
  ],
  [
    'ß after _, which TypeScript leaves to this check',
    { a_ß: { access: 'read' }, a_s_s: { access: 'read' } },
    'addresses.fields.a_s_s: public name "aSS" collides with fields.a_ß; set as',
  ],
];

/** An `addresses` declaration that gets, with the given fields. */
const addresses = (fields: object) => () =>
  declare('addresses', { operations: ['get'], fields });

/** An `addresses` declaration whose `constructor_id` relationship has no `as`. */
const addressRelationship = () =>
  declare('addresses', {
    operations: ['get'],
    fields: {},
    relationships: { constructor_id: { target, access: 'read' } },
  });

describe('deriveNames: columns that are not plain (SPEC 4.2, 14)', () => {
  it.each(MERGED_COLUMNS)(
    'refuses two columns merged by %s',
    (_title, fields, message) => {
      expect(typeErrorOf(addresses(fields))).toBe(message);
    },
  );

  it('refuses a trailing -', () => {
    expect(typeErrorOf(addresses({ 'suite-': { access: 'read' } }))).toBe(
      'addresses.fields.suite-: public name "suite-" is not a JSON:API member name; set as',
    );
  });

  it('refuses a trailing _ or an _id that leaves a reserved name', () => {
    expect(typeErrorOf(addresses({ type_: { access: 'read' } }))).toBe(
      'addresses.fields.type_: public name "type" is a member of every resource object; set as',
    );
    expect(typeErrorOf(addressRelationship)).toBe(
      'addresses.relationships.constructor_id: public name "constructor" is a member of Object.prototype; set as',
    );
  });
});

/** `[title, members, message]` for each code mistake. */
const CODE_ERRORS: ReadonlyArray<readonly [string, object, string]> = [
  [
    'a derived code outside A-Z, 0-9, _',
    { fields: { größe: { access: 'read' } } },
    'notes.rules.notes_größe_check: code "NOTES_GRÖSSE_CHECK" is not A-Z, 0-9, _; set code',
  ],
  [
    'a given code outside A-Z, 0-9, _',
    {
      fields: { größe: { access: 'read' } },
      rules: { notes_größe_check: { code: 'note-size' } },
    },
    'notes.rules.notes_größe_check.code: "note-size" is not A-Z, 0-9, _',
  ],
  [
    'two CHECKs that derive one code',
    { fields: { body_text: { access: 'read' } } },
    'notes.rules.notes_body_check: code "NOTES_BODY_CHECK" collides with Notes_body_check; set code',
  ],
  [
    'a given code that another key derives',
    {
      operations: ['create'],
      fields: { type: { access: 'immutable', as: 'kind' } },
      rules: { notes_type_not_null: { code: 'NOTES_TYPE_CHECK' } },
    },
    'notes.rules.notes_type_not_null.code: "NOTES_TYPE_CHECK" collides with notes_type_check',
  ],
  [
    'a code on a constraint over no public member',
    { rules: { notes_contact_id_fkey: { code: 'NOTE_CONTACT_MISSING' } } },
    'notes.rules.notes_contact_id_fkey.code: the key has no code, since clients cannot violate it',
  ],
  [
    'a code on the primary key without clientIds',
    { rules: { notes_pkey: { code: 'NOTE_EXISTS' } } },
    'notes.rules.notes_pkey.code: the key has no code, since clients cannot violate it',
  ],
  [
    'a code on the NOT NULL key of a read-only member',
    {
      fields: { type: { access: 'read', as: 'kind' } },
      rules: { notes_type_not_null: { code: 'NOTE_KIND_REQUIRED' } },
    },
    'notes.rules.notes_type_not_null.code: the key has no code, since clients cannot violate it',
  ],
];

describe('deriveNames: codes (SPEC 4.2, 9.1, 14)', () => {
  it.each(CODE_ERRORS)('refuses %s', (_title, members, message) => {
    expect(typeErrorOf(notes(members))).toBe(message);
  });

  it('accepts a code on the primary key under clientIds', () => {
    const resource = notes({
      clientIds: true,
      rules: { notes_pkey: { code: 'NOTE_EXISTS' } },
    })();
    expect(resource.names.codes.get('NOTE_EXISTS')).toBe('notes_pkey');
  });
});
