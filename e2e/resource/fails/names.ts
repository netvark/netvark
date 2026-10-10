/**
 * Public names JSON:API refuses or two members share, and codes the
 * declaration gives (resource SPEC 4.2, 14). A derived code that fails is
 * reported when the declaration runs (`declarations.e2e.test.ts`). Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { Contacts } from '../resources/contacts.ts';
import { declareResource } from '../resources/declare-resource.ts';

declareResource('notes', {
  operations: ['get'],
  fields: {
    // error: public name "type" is a member of every resource object; set as
    type: { access: 'read' },
  },
});

declareResource('notes', {
  operations: ['get'],
  fields: {},
  relationships: {
    // error: the column does not end in _id; set as
    author: { target: () => Contacts, access: 'read' },
  },
});

declareResource('notes', {
  operations: ['get'],
  fields: {
    // error: public name "contact" collides with relationships.contact_id; set as
    contact: { access: 'read' },
  },
  relationships: {
    // error: public name "contact" collides with fields.contact; set as
    contact_id: { target: () => Contacts, access: 'read' },
  },
});

declareResource('notes', {
  operations: ['get'],
  fields: {
    // error: as: "body" collides with fields.body
    contact: { access: 'read', as: 'body' },
    // error: public name "body" collides with fields.contact; set as
    body: { access: 'read' },
    // error: as: "lid" is a member of every resource object
    created_at: { access: 'read', as: 'lid' },
  },
});

declareResource('notes', {
  // error: as: "notes.v2" is not a JSON:API member name
  as: 'notes.v2',
  operations: ['get'],
  fields: { body: { access: 'read' } },
});

declareResource('notes', {
  operations: ['create'],
  fields: {
    type: { access: 'immutable', as: 'kind' },
    body: { access: 'immutable' },
    priorität: { access: 'immutable' },
  },
  rules: {
    // error: code: "NOTE_PRIORITÄT" is not A-Z, 0-9, _
    notes_priorität_check: { code: 'NOTE_PRIORITÄT' },
    // error: code: "NOTES_TYPE_CHECK" collides with notes_type_check
    notes_body_check: { code: 'NOTES_TYPE_CHECK' },
    // error: code: the key has no code, since clients cannot violate it
    notes_pkey: { code: 'NOTE_EXISTS' },
  },
});
