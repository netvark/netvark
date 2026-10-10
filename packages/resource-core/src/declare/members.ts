/**
 * The public members of a declaration and the columns its operations write
 * (SPEC 3.1, 3.5, 9.1), at runtime and in types: the validators a CHECK
 * needs and the codes a resource derives both read them.
 * @packageDocumentation
 */
import type { Declaration, DeclaredMembers, MemberOf } from './types';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** The columns of the declared fields and relationships: the public members. */
export type MemberColumn<TDecl extends Declaration> =
  | (keyof Fields<TDecl> & string)
  | (keyof Relationships<TDecl> & string);

/** Members with an access other than `read`: what the declared operations write. */
export type WrittenColumn<TDecl extends Declaration> =
  | {
      [K in keyof Fields<TDecl>]: Fields<TDecl>[K]['access'] extends 'read'
        ? never
        : K;
    }[keyof Fields<TDecl>]
  | {
      [K in keyof Relationships<TDecl>]: MemberOf<
        Relationships<TDecl>[K],
        'access'
      > extends 'read'
        ? never
        : K;
    }[keyof Relationships<TDecl>];

function membersOf(declaration: Declaration) {
  return [
    ...Object.entries(declaration.fields),
    ...Object.entries(declaration.relationships ?? {}),
  ];
}

/** The columns of the declared fields and relationships. */
export function memberColumns(declaration: Declaration): ReadonlySet<string> {
  return new Set(membersOf(declaration).map(([column]) => column));
}

/** Columns the declared operations write: members whose access is not `read`. */
export function writtenColumns(declaration: Declaration): ReadonlySet<string> {
  return new Set(
    membersOf(declaration)
      .filter(([, member]) => member.access !== 'read')
      .map(([column]) => column),
  );
}
