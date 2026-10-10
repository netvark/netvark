/** Tenants: the one table no scope applies to. */
import { declareResource } from './declare-resource.ts';

export const Organizations = declareResource('organizations', {
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite', filter: ['eq', 'containsi'], sort: true },
    slug: { access: 'immutable', filter: ['eq'] },
    handle: { access: 'readWrite', filter: ['eq'] },
    seats: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    country: { access: 'readWrite', filter: ['eq', 'in'] },
    created_at: { access: 'read', sort: true },
  },
  sort: { default: ['-created_at'] },
  rules: {
    organizations_slug_key: { code: 'ORGANIZATION_SLUG_TAKEN' },
    organizations_handle_key: { code: 'ORGANIZATION_HANDLE_TAKEN' },
  },
});
