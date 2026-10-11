/**
 * Declared resources the server's runtime tests run on (SPEC 12), over the
 * unit-test catalog, typed wide: `domain.test-d.ts` declares the same ones
 * typed. Organizations leave `slug` to the server, document notes their
 * id and document, contacts are scoped and include their organization,
 * and teams are read-only. Not published with the package.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from './contacts';
import { TEST_REGISTRIES } from './definer';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

export const Organizations: DeclaredResource = declareResource(
  'organizations',
  {
    operations: ['get', 'create', 'update'],
    fields: { name: { access: 'readWrite' }, slug: { access: 'read' } },
  },
);

export const Contacts: DeclaredResource = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite' },
    email: { access: 'readWrite' },
    kind: { access: 'immutable' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'read',
      include: true,
    },
  },
});

export const DocumentNotes: DeclaredResource = declareResource(
  'document_notes',
  {
    operations: ['get', 'create'],
    fields: {},
  },
);

export const Teams: DeclaredResource = declareResource('teams', {
  operations: ['list', 'get'],
  fields: { name: { access: 'read' } },
});
