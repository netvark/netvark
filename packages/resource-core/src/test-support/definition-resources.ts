/**
 * Declared resources whose derived keyset and JSON:API definitions the
 * unit tests compare with hand-written ones (SPEC 11), over the unit-test
 * catalog and typed: contacts filter every keyset type the catalog has (an
 * enum, a text column with an `enum` rule, citext, an array, a timestamp,
 * a relationship) and search, sort by default, and override the definer's
 * page; organizations only sort, ascending by default. Typed wide, since
 * an export needs an explicit type (`isolatedDeclarations`): the type
 * tests declare their own. Not published with the package.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from './contacts';
import { TEST_REGISTRIES } from './definer';

/** The definer's links and page, which both derived definitions take. */
export const DEFINER_LINKS: { readonly base: '/api' } = { base: '/api' };

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
  links: DEFINER_LINKS,
  page: { max: 50 },
});

export const Organizations: DeclaredResource = declareResource(
  'organizations',
  {
    operations: ['list', 'get'],
    fields: { name: { access: 'read', sort: true } },
    sort: { default: ['name'] },
  },
);

export const Contacts: DeclaredResource = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    nickname: { access: 'readWrite', as: 'alias', filter: ['isNull'] },
    email: { access: 'readWrite', filter: ['eqi'] },
    status: { access: 'readWrite', filter: ['in'] },
    priority: { access: 'readWrite', sort: true },
    tags: { access: 'readWrite', filter: ['contains'] },
    website: { access: 'write' },
    created_at: { access: 'read', filter: ['gte', 'lt'], sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      filter: ['eq', 'in'],
      include: true,
    },
  },
  search: { column: 'search' },
  sort: { default: ['-created_at', { field: 'name', direction: 'asc' }] },
  page: { default: 25 },
});
