/**
 * Resources for the registry tests (SPEC 4.2, 9.2): organizations,
 * contacts scoped by organization, and meetings, whose attendees share the
 * `email` domain with contacts, declared over the unit-test catalog with
 * types erased. Not published with the package.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';

import { untypedDeclare } from './catalog-builder';

export const declare: ReturnType<typeof untypedDeclare> = untypedDeclare();

export const Organizations: DeclaredResource = declare('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

/** Contacts with `rules` added, its organization relationship targeting `organizations`. */
export function contactsWith(
  rules: object = {},
  organizations: () => unknown = () => Organizations,
): DeclaredResource {
  return declare('contacts', {
    operations: ['get', 'create'],
    scope: 'organization',
    fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
    relationships: {
      organization_id: { target: organizations, access: 'read' },
    },
    rules,
  });
}

export const Contacts: DeclaredResource = contactsWith();

export const Meetings: DeclaredResource = declare('meetings', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    room: { access: 'readWrite' },
    notes: { access: 'readWrite' },
    attendees: { access: 'readWrite' },
  },
  relationships: {
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
});
