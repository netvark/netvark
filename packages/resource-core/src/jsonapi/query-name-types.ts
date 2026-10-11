/**
 * The public names a declared resource's list sorts and filters by, in
 * types (SPEC 11.1, 11.2): the vocabulary both derived definitions share,
 * the twin of the members `checkFilters` returns.
 * @packageDocumentation
 */
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { FieldNameOf, RelationshipNameOf } from '../names/public-names';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** The public names of the fields declared with `sort: true`. */
export type SortNameOf<TDecl extends Declaration> = {
  [K in keyof Fields<TDecl> & string]: MemberOf<
    Fields<TDecl>[K],
    'sort'
  > extends true
    ? FieldNameOf<K, Fields<TDecl>[K]>
    : never;
}[keyof Fields<TDecl> & string];

/** The public names of the fields and relationships declared with `filter`. */
export type FilterNameOf<TDecl extends Declaration> =
  | {
      [K in keyof Fields<TDecl> & string]: MemberOf<
        Fields<TDecl>[K],
        'filter'
      > extends ReadonlyArray<unknown>
        ? FieldNameOf<K, Fields<TDecl>[K]>
        : never;
    }[keyof Fields<TDecl> & string]
  | {
      [K in keyof Relationships<TDecl> & string]: MemberOf<
        Relationships<TDecl>[K],
        'filter'
      > extends ReadonlyArray<unknown>
        ? RelationshipNameOf<K, Relationships<TDecl>[K]>
        : never;
    }[keyof Relationships<TDecl> & string];
