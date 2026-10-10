/**
 * Tables a resource cannot be declared over (resource SPEC 3.4, 14). Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { declareResource } from '../resources/declare-resource.ts';

// error: contact_phones: a resource needs a single-column primary key
declareResource('contact_phones', { operations: ['get'], fields: {} });

// error: import_batches: the primary key's type jsonb cannot carry a resource id
declareResource('import_batches', { operations: ['get'], fields: {} });

// error: Argument of type '"audit.changes"' is not assignable to parameter of type 'TableName<
declareResource('audit.changes', { operations: ['get'], fields: {} });

declareResource('organizations', {
  operations: ['create'],
  // error: clientIds: the primary key is an identity column generated always, which takes no client value
  clientIds: true,
  fields: { name: { access: 'immutable' } },
});
