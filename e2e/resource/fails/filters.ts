/**
 * Filters and sorts keyset-core cannot run (resource SPEC 11.3, 14). Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { declareResource } from '../resources/declare-resource.ts';
import { Organizations } from '../resources/organizations.ts';

declareResource('contacts', {
  operations: ['list', 'get'],
  fields: {
    // error: filter: operator "gt" is not available for array fields
    tags: { access: 'read', filter: ['gt'] },
    // error: filter: operator "contains" is not available for enum fields
    status: { access: 'read', filter: ['eq', 'contains'] },
    // error: filter: operator "isNull" is not available for non-null fields
    name: { access: 'read', filter: ['isNull'] },
    nickname: { access: 'read', filter: ['containsi', 'isNull'], sort: true },
  },
  relationships: {
    // error: filter: operator "isNull" is not available for non-null fields
    organization_id: {
      target: () => Organizations,
      access: 'read',
      filter: ['eq', 'isNull'],
    },
  },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {
    // error: sort: an array field is not sortable
    tags: { access: 'read', sort: true },
  },
});

declareResource('import_rows', {
  operations: ['list'],
  fields: {
    // error: filter: type jsonb is not filterable
    payload: { access: 'read', filter: ['eq'] },
  },
});

declareResource('meetings', {
  operations: ['list'],
  fields: {
    // error: sort: a codec field is not sortable
    during: { access: 'read', codec: 'timeRange', sort: true },
  },
});
