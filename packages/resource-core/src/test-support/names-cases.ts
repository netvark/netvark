/**
 * The names case table (SPEC 4.1, 4.3, 9.1): declarations over the
 * unit-test catalogs and the names each derives, in the order `deriveNames`
 * enters them (fields, then relationships, in declaration order; codes of
 * constraints in catalog order, then of NOT NULL keys in column order).
 * `deriveNames` (`names/derive-names.test.ts`) and the type-level
 * `TypeNameOf`, `FieldNames`, `RelationshipNames`, and `CodeNames`
 * (`names/public-names.test-d.ts`) are both held to it. Not published with
 * the package.
 * @packageDocumentation
 */

export const NAME_CASES = [
  {
    title:
      'contacts: camelCase fields, a relationship without _id, and the codes clients can cause, none for the scope column alone',
    catalog: 'contacts',
    table: 'contacts',
    declaration: {
      operations: ['list', 'get', 'create', 'update'],
      scope: 'organization',
      fields: {
        kind: { access: 'immutable' },
        name: { access: 'readWrite' },
        email: { access: 'readWrite' },
        created_at: { access: 'read' },
      },
      relationships: {
        organization_id: { target: () => null, access: 'read' },
      },
      rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
    },
    names: {
      type: 'contacts',
      fields: [
        ['kind', 'kind'],
        ['name', 'name'],
        ['email', 'email'],
        ['createdAt', 'created_at'],
      ],
      relationships: [['organization', 'organization_id']],
      codes: [
        ['CONTACT_EMAIL_TAKEN', 'contacts_email_unique'],
        ['CONTACTS_NAME_CHECK', 'contacts_name_check'],
        ['CONTACTS_KIND_NOT_NULL', 'contacts_kind_not_null'],
        ['CONTACTS_NAME_NOT_NULL', 'contacts_name_not_null'],
      ],
    },
  },
  {
    title:
      'meetings: the primary key coded under clientIds, a self-reference, and a given code',
    catalog: 'contacts',
    table: 'meetings',
    declaration: {
      operations: ['get', 'create'],
      clientIds: true,
      fields: {
        room: { access: 'immutable' },
        during: { access: 'immutable', codec: 'range' },
      },
      relationships: {
        follow_up_of_id: { target: () => null, access: 'immutable' },
      },
      rules: {
        meetings_room_check: {
          validator: 'room',
          code: 'MEETING_ROOM_INVALID',
        },
      },
    },
    names: {
      type: 'meetings',
      fields: [
        ['room', 'room'],
        ['during', 'during'],
      ],
      relationships: [['followUpOf', 'follow_up_of_id']],
      codes: [
        ['MEETINGS_FOLLOW_UP_OF_ID_FKEY', 'meetings_follow_up_of_id_fkey'],
        ['MEETINGS_NO_DOUBLE_BOOKING', 'meetings_no_double_booking'],
        ['MEETINGS_PKEY', 'meetings_pkey'],
        ['MEETING_ROOM_INVALID', 'meetings_room_check'],
        ['MEETINGS_ROOM_NOT_NULL', 'meetings_room_not_null'],
        ['MEETINGS_DURING_NOT_NULL', 'meetings_during_not_null'],
      ],
    },
  },
  {
    title:
      'notes: as on the type, fields, and a relationship, and a code that settles a code two CHECKs derive',
    catalog: 'names',
    table: 'notes',
    declaration: {
      as: 'memos',
      operations: ['get', 'create'],
      fields: {
        type: { access: 'immutable', as: 'kind' },
        contact: { access: 'read', as: 'contactName' },
        größe: { access: 'immutable' },
        body_text: { access: 'read' },
      },
      relationships: {
        author: { target: () => null, access: 'read', as: 'author' },
        contact_id: { target: () => null, access: 'immutable' },
      },
      rules: {
        notes_größe_check: { code: 'NOTE_SIZE_NOT_POSITIVE' },
        Notes_body_check: { code: 'NOTE_BODY_EMPTY' },
      },
    },
    names: {
      type: 'memos',
      fields: [
        ['kind', 'type'],
        ['contactName', 'contact'],
        ['größe', 'größe'],
        ['bodyText', 'body_text'],
      ],
      relationships: [
        ['author', 'author'],
        ['contact', 'contact_id'],
      ],
      codes: [
        ['NOTE_BODY_EMPTY', 'Notes_body_check'],
        ['NOTES_AUTHOR_FKEY', 'notes_author_fkey'],
        ['NOTES_BODY_CHECK', 'notes_body_check'],
        ['NOTES_CONTACT_ID_FKEY', 'notes_contact_id_fkey'],
        ['NOTE_SIZE_NOT_POSITIVE', 'notes_größe_check'],
        ['NOTES_TYPE_CHECK', 'notes_type_check'],
        ['NOTES_TYPE_NOT_NULL', 'notes_type_not_null'],
      ],
    },
  },
  {
    title: 'organizations: read-only fields under no constraint derive no code',
    catalog: 'contacts',
    table: 'organizations',
    declaration: {
      operations: ['get'],
      fields: { name: { access: 'read' }, created_at: { access: 'read' } },
    },
    names: {
      type: 'organizations',
      fields: [
        ['name', 'name'],
        ['createdAt', 'created_at'],
      ],
      relationships: [],
      codes: [],
    },
  },
] as const;
