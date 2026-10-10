import { Contacts } from '../resources/contacts.ts';
/**
 * Rules and the validators CHECKs without a rule need (resource SPEC 3.5,
 * 14). Each `// error:` names a text the diagnostic on the next line must
 * contain.
 */
import { declareResource } from '../resources/declare-resource.ts';

// error: rules.meetings_room_lowercase: a CHECK without a rule needs a validator
declareResource('meetings', {
  operations: ['create'],
  fields: { room: { access: 'immutable' } },
});

// error: rules.meetings_contact_or_notes: a CHECK without a rule needs a validator
declareResource('meetings', {
  operations: ['create'],
  fields: {},
  relationships: {
    contact_id: { target: () => Contacts, access: 'immutable' },
  },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {},
  rules: {
    // error: validator: the CHECK has a rule, which enforces it already
    contacts_name_check: { validator: 'lowercase' },
    // error: validator: a validator covers only a CHECK without a rule
    contacts_email_unique: { validator: 'lowercase' },
    // error: "contacts_fax_check" is not a constraint or NOT NULL key of contacts
    contacts_fax_check: { code: 'CONTACT_FAX' },
  },
});

declareResource('meetings', {
  operations: ['create'],
  fields: { room: { access: 'immutable' } },
  rules: {
    // error: validator: "lowercased" is not a validator of createDeclareResource
    meetings_room_lowercase: { validator: 'lowercased' },
  },
});
