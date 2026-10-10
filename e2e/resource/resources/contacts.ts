/**
 * Contacts, scoped to the caller's organization: the server writes
 * `organization_id`, so its relationship is read-only. `search` is generated
 * with the `simple` configuration, which the declaration may restate. The
 * partial unique index `contacts_active_name_unique` takes a code like any
 * constraint.
 */
import { declareResource } from './declare-resource.ts';
import { Organizations } from './organizations.ts';

export const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite', filter: ['eq'] },
    website: { access: 'readWrite' },
    status: { access: 'readWrite', filter: ['eq', 'in'] },
    priority: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    discount: { access: 'readWrite' },
    tags: { access: 'readWrite', filter: ['contains', 'overlaps'] },
    created_at: { access: 'read', filter: ['gte', 'lt'], sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'read',
      include: true,
    },
  },
  search: { column: 'search', config: 'simple', mode: 'websearch' },
  sort: { default: ['name', { field: 'created_at', direction: 'desc' }] },
  rules: {
    contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' },
    contacts_active_name_unique: { code: 'CONTACT_NAME_TAKEN' },
    contacts_name_not_null: { code: 'CONTACT_NAME_REQUIRED' },
  },
});
