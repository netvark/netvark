/**
 * Runtime-neutral checks (resource SPEC 15.4, 16) over the built
 * `@netvark/resource-core`: the contacts application's declarations load
 * and resolve, and mistakes throw the documented `TypeError`s. No Node.js
 * API, so the same module runs on Bun, Deno, and workerd.
 */
import type { Checks } from './report.ts';

import { createDeclareResource } from '@netvark/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { Contacts } from '../resources/contacts.ts';
import { declareResource } from '../resources/declare-resource.ts';
import { Meetings } from '../resources/meetings.ts';
import { Organizations } from '../resources/organizations.ts';
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
