/**
 * Meetings, which reference contacts and organizations through targets read
 * lazily (resource SPEC 3.8). Writing `room` and `contact_id` or `notes`
 * needs the validators of the two CHECKs without a rule; `during` carries
 * the tstzrange codec.
 */
import { Contacts } from './contacts.ts';
import { declareResource } from './declare-resource.ts';
import { Organizations } from './organizations.ts';

export const Meetings = declareResource('meetings', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  clientIds: true,
  fields: {
    room: { access: 'readWrite', filter: ['eq', 'in'], sort: true },
    during: { access: 'readWrite', codec: 'timeRange' },
    notes: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    contact_id: {
      target: () => Contacts,
      access: 'readWrite',
      filter: ['eq', 'isNull'],
      include: true,
    },
  },
  sort: { default: ['room'] },
  rules: {
    meetings_room_lowercase: {
      validator: 'lowercase',
      code: 'MEETING_ROOM_NOT_LOWERCASE',
    },
    meetings_contact_or_notes: {
      validator: 'contactOrNotes',
      code: 'MEETING_NEEDS_CONTACT_OR_NOTES',
    },
    meetings_no_double_booking: { code: 'MEETING_ROOM_DOUBLE_BOOKED' },
  },
});
