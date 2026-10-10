/**
 * Scope, operations, search, sort, and unknown members (resource SPEC 3.2,
 * 3.3, 3.7, 14). Each `// error:` names a text the diagnostic on the next
 * line must contain.
 */
import { declareResource } from '../resources/declare-resource.ts';

declareResource('contacts', {
  operations: ['get'],
  // error: scope: "tenant" is not a scope of createDeclareResource
  scope: 'tenant',
  fields: {},
});

declareResource('contacts', {
  // error: operations: list at least one operation
  operations: [],
  fields: {},
});

declareResource('contacts', {
  // error: operations: an operation is listed twice
  operations: ['get', 'get'],
  fields: {},
});

declareResource('contacts', {
  // error: operations: update needs a field or relationship writable on update
  operations: ['get', 'update'],
  fields: { name: { access: 'read' } },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {},
  // error: search.column: "name" is not a tsvector column of contacts
  search: { column: 'name' },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {},
  // error: search.config: the column is generated with config "simple"
  search: { column: 'search', config: 'english' },
});

declareResource('contacts', {
  operations: ['list'],
  fields: { name: { access: 'read' } },
  // error: sort.default: "name" is not declared with sort: true
  sort: { default: ['-name'] },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {},
  // error: "filters" is not a member of a declaration
  filters: {},
});
