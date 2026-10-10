/**
 * Relationships the catalog does not allow (resource SPEC 3.1, 3.2, 3.8,
 * 14). Each `// error:` names a text the diagnostic on the next line must
 * contain.
 */
import { declareResource } from '../resources/declare-resource.ts';
import { Organizations } from '../resources/organizations.ts';

declareResource('contacts', {
  operations: ['create'],
  scope: 'organization',
  fields: { name: { access: 'immutable' } },
  relationships: {
    // error: "name" is not the column of a single-column foreign key
    name: { target: () => Organizations, access: 'read' },
    // error: access: the scope column is read-only
    organization_id: { target: () => Organizations, access: 'immutable' },
  },
});

declareResource('import_rows', {
  operations: ['get'],
  fields: { payload: { access: 'read' } },
  relationships: {
    // error: type jsonb cannot carry a resource id
    batch: { target: () => Organizations, access: 'read', as: 'batch' },
  },
});

declareResource('meetings', {
  operations: ['get'],
  fields: {},
  relationships: {
    // error: access: readWrite needs the create or update operation
    organization_id: { target: () => Organizations, access: 'readWrite' },
  },
});

declareResource('meetings', {
  operations: ['get'],
  fields: {},
  relationships: {
    // error: provides no match for the signature '(): void'
    organization_id: { target: Organizations, access: 'read' },
  },
});
