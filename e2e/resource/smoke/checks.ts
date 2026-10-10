/**
 * Runtime-neutral checks (resource SPEC 15.4, 16) over the built
 * `@netvark/resource-core`: the contacts application's declarations load,
 * resolve, and derive their public names, the codecs and validators parse
 * their fixtures with the application's Zod, and mistakes throw the
 * documented `TypeError`s. Codes are upper-cased by the runtime's
 * `String.prototype.toUpperCase`, so each runtime derives them here. No
 * Node.js API, so the same module runs on Bun, Deno, and workerd.
 */
import type { Checks } from './report.ts';

import { createDeclareResource, defineValidator } from '@netvark/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { Contacts } from '../resources/contacts.ts';
import { declareResource } from '../resources/declare-resource.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';
import { validators } from '../resources/validators.ts';
import { check } from './report.ts';

/** The `TypeError` message of calling `fn` with `args` as JavaScript would, types erased. */
function messageOf(
  fn: (...args: never) => unknown,
  args: ReadonlyArray<unknown>,
): string {
  try {
    Reflect.apply(fn, undefined, args);
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
  return 'no TypeError';
}

export const neutralChecks: Checks = {
  'declares the contacts application': () => {
    // Typed wide, so each comparison tests the runtime value, not the literal type.
    const table: string = Contacts.table;
    const codec: string = Meetings.declaration.fields.during.codec;
    check(table === 'contacts', `table ${table}`);
    check(Object.isFrozen(Meetings.declaration), 'declaration not frozen');
    check(codec === 'timeRange', `codec ${codec}`);
  },
  'resolves relationship targets lazily': () => {
    check(
      Meetings.declaration.relationships.contact_id.target() === Contacts,
      'contact_id target',
    );
    check(
      Contacts.declaration.relationships.organization_id.target() ===
        Organizations,
      'organization_id target',
    );
  },
  'derives the public names': () => {
    const kind = Notes.names.fields.get('kind');
    const created = Notes.names.columns.get('created_at');
    const code = Notes.names.rules.get('notes_type_check');
    check(kind === 'type', `kind ${String(kind)}`);
    check(created === 'createdAt', `created_at ${String(created)}`);
    check(code === 'NOTES_TYPE_CHECK', `notes_type_check ${String(code)}`);
  },
  'refuses a derived code outside A-Z': () => {
    const message = messageOf(declareResource, [
      'notes',
      { operations: ['get'], fields: { priorität: { access: 'read' } } },
    ]);
    check(
      message ===
        'notes.rules.notes_priorität_check: code "NOTES_PRIORITÄT_CHECK" is not A-Z, 0-9, _; set code',
      message,
    );
  },
  'checks a validator against its fixtures': () => {
    const message = messageOf(defineValidator, [
      {
        schema: validators.lowercase.schema,
        fixtures: { accept: ['lobby'], reject: ['lobby-2'] },
      },
    ]);
    check(
      message ===
        'defineValidator.fixtures.reject[0]: the schema accepts this fixture',
      message,
    );
  },
  'refuses a written CHECK without a validator': () => {
    const message = messageOf(declareResource, [
      'meetings',
      { operations: ['create'], fields: { room: { access: 'immutable' } } },
    ]);
    check(
      message ===
        'meetings.rules.meetings_room_lowercase: a CHECK without a rule needs a validator',
      message,
    );
  },
  'refuses the full catalog': () => {
    const message = messageOf(createDeclareResource, [{ catalog }]);
    check(
      message.startsWith('createDeclareResource.catalog: a full catalog'),
      message,
    );
  },
};
