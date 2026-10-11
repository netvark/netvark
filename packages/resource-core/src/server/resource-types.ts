/**
 * A declared resource as the server's definers read it in types (SPEC 12):
 * its public row, its write inputs, its public members, its operations,
 * and the relationships a client may include. Each is computed where a
 * definer reads it, from the resource's own type members, and is wide for
 * a resource whose table TypeScript does not know.
 * @packageDocumentation
 */
import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { DeclareContext } from '../declare/registries';
import type {
  Declaration,
  DeclaredMembers,
  MemberOf,
  Operation,
} from '../declare/types';
import type {
  FieldNames,
  RelationshipNameOf,
  RelationshipNames,
} from '../names/public-names';
import type { TypesOf } from '../schema/resource-types';
import type { PublicRow, StorageWrite } from './storage';

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** The parts of a resource's type the helpers read: table, declaration, and the definer context. */
type Parts<TResource> = TResource extends {
  readonly table: infer TTable extends string;
  readonly declaration: infer TDecl extends Declaration;
  readonly '~context'?: infer TContext;
}
  ? string extends TTable
    ? undefined
    : NonNullable<TContext> extends infer TDefined extends DeclareContext
      ? {
          readonly context: TDefined;
          readonly table: TTable;
          readonly decl: TDecl;
        }
      : undefined
  : undefined;

type Types<TParts> = TParts extends {
  readonly context: infer TContext extends DeclareContext;
  readonly table: infer TTable extends string;
  readonly decl: infer TDecl extends Declaration;
}
  ? TypesOf<TContext, TTable, TDecl>
  : never;

type DeclOf<TResource> = TResource extends {
  readonly declaration: infer TDecl extends Declaration;
}
  ? TDecl
  : Declaration;

/** Linkage as target ids: a nullable relationship takes `null`. */
type LinkIds<TLinkage> = {
  readonly [K in keyof TLinkage]: null extends TLinkage[K]
    ? string | null
    : string;
};

/** A resource's public row: `id`, each readable field, and each relationship's target id. */
export type PublicRowOf<TResource extends AnyDeclaredResource> =
  Parts<TResource> extends undefined
    ? PublicRow
    : Simplify<
        { readonly id: string } & Types<Parts<TResource>>['read'] &
          LinkIds<Types<Parts<TResource>>['linkage']['read']>
      >;

/** A create's input: the parsed members it carried, relationships as ids, and a client id when the resource takes one. */
export type CreateInputOf<TResource extends AnyDeclaredResource> =
  Parts<TResource> extends undefined
    ? StorageWrite
    : Simplify<
        (MemberOf<DeclOf<TResource>, 'clientIds'> extends true
          ? { readonly id?: string }
          : unknown) & {
          readonly attributes: Readonly<Types<Parts<TResource>>['create']>;
          readonly relationships: LinkIds<
            Types<Parts<TResource>>['linkage']['create']
          >;
        }
      >;

/** An update's input: the parsed members it carried, relationships as ids. */
export type UpdateInputOf<TResource extends AnyDeclaredResource> =
  Parts<TResource> extends undefined
    ? StorageWrite
    : {
        readonly attributes: Readonly<Types<Parts<TResource>>['update']>;
        readonly relationships: LinkIds<
          Types<Parts<TResource>>['linkage']['update']
        >;
      };

/** The operations a resource declares. */
export type OperationOf<TResource extends AnyDeclaredResource> =
  DeclOf<TResource>['operations'][number] & Operation;

/** A resource's public member names, and `id`: what a rejection may point at. */
export type MemberNameOf<TResource extends AnyDeclaredResource> =
  Parts<TResource> extends undefined
    ? string
    :
        | keyof FieldNames<DeclOf<TResource>>
        | keyof RelationshipNames<DeclOf<TResource>>
        | 'id';

type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** The public names of the relationships a client may include (`include: true`). */
export type IncludableOf<TResource extends AnyDeclaredResource> =
  Parts<TResource> extends undefined
    ? string
    : {
        [K in keyof Relationships<DeclOf<TResource>> & string]: MemberOf<
          Relationships<DeclOf<TResource>>[K],
          'include'
        > extends true
          ? RelationshipNameOf<K, Relationships<DeclOf<TResource>>[K]>
          : never;
      }[keyof Relationships<DeclOf<TResource>> & string];
