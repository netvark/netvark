/**
 * The unit-test catalog (SPEC 15.1): a public catalog literal modeled on the
 * contacts application of `e2e/catalog`. `createDeclareResource` holds it
 * to `PublicCatalog`, so it cannot drift from the model. The literal is
 * typed by an explicit interface, which keeps the literal types under
 * `isolatedDeclarations`. Not published with the package.
 * @packageDocumentation
 */
import { CONTACTS_TABLE } from './catalog/contacts-table';
import {
  DOCUMENT_NOTES_TABLE,
  DOCUMENTS_TABLE,
} from './catalog/documents-tables';
import { AUDIT_CHANGES_TABLE, MEETINGS_TABLE } from './catalog/meetings-table';
import {
  CONTACT_PHONES_TABLE,
  ORGANIZATIONS_TABLE,
} from './catalog/organizations-table';
import { TAGS_TABLE } from './catalog/tags-table';
import { PEOPLE_TABLE, TEAMS_TABLE } from './catalog/teams-tables';
import { DOMAINS, ENUMS } from './catalog/types';

export interface ContactsCatalog {
  readonly format: 1;
  readonly enums: typeof ENUMS;
  readonly domains: typeof DOMAINS;
  readonly tables: {
    readonly 'audit.changes': typeof AUDIT_CHANGES_TABLE;
    readonly contact_phones: typeof CONTACT_PHONES_TABLE;
    readonly contacts: typeof CONTACTS_TABLE;
    readonly document_notes: typeof DOCUMENT_NOTES_TABLE;
    readonly documents: typeof DOCUMENTS_TABLE;
    readonly meetings: typeof MEETINGS_TABLE;
    readonly organizations: typeof ORGANIZATIONS_TABLE;
    readonly people: typeof PEOPLE_TABLE;
    readonly tags: typeof TAGS_TABLE;
    readonly teams: typeof TEAMS_TABLE;
  };
}

export const contactsCatalog: ContactsCatalog = {
  format: 1,
  enums: ENUMS,
  domains: DOMAINS,
  tables: {
    'audit.changes': AUDIT_CHANGES_TABLE,
    contact_phones: CONTACT_PHONES_TABLE,
    contacts: CONTACTS_TABLE,
    document_notes: DOCUMENT_NOTES_TABLE,
    documents: DOCUMENTS_TABLE,
    meetings: MEETINGS_TABLE,
    organizations: ORGANIZATIONS_TABLE,
    people: PEOPLE_TABLE,
    tags: TAGS_TABLE,
    teams: TEAMS_TABLE,
  },
};
