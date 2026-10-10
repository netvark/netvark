/**
 * Columns of the unit-test catalog and their types followed through their
 * domains, read by `columns.test.ts` and `resolve-type.test-d.ts` so the
 * runtime resolution and its type-level twin agree on the same cases. Not
 * published with the package.
 * @packageDocumentation
 */

export const RESOLVE_CASES = [
  {
    table: 'contacts',
    column: 'name',
    type: 'text',
    typeKind: 'base',
    depth: 0,
    domains: [],
  },
  {
    table: 'contacts',
    column: 'email',
    type: 'citext',
    typeKind: 'base',
    depth: 0,
    domains: ['email'],
  },
  {
    table: 'meetings',
    column: 'attendees',
    type: 'citext',
    typeKind: 'base',
    depth: 1,
    domains: ['email'],
  },
  {
    table: 'contacts',
    column: 'kind',
    type: 'contact_kind',
    typeKind: 'enum',
    depth: 0,
    domains: [],
  },
  {
    table: 'meetings',
    column: 'during',
    type: 'tstzrange',
    typeKind: 'range',
    depth: 0,
    domains: [],
  },
] as const;
