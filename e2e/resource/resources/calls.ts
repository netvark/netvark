/**
 * Calls, stored in partitions of the `calls` table: what PostgreSQL raises
 * for a call names the partition that holds it, so the runtime resolves
 * the partitioned table's names before `constraintError` maps them
 * (resource SPEC 9.5). Clients give the ids, so a duplicate reaches the
 * partition's own primary key index.
 */
import { Contacts } from './contacts.ts';
import { declareResource } from './declare-resource.ts';

export const Calls = declareResource('calls', {
  operations: ['get', 'create'],
  scope: 'organization',
  clientIds: true,
  fields: {
    minutes: { access: 'readWrite' },
    note: { access: 'readWrite' },
  },
  relationships: {
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
});
