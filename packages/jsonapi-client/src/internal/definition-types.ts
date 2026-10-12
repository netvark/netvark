/**
 * Type helpers over definitions shared by the query, record, and client
 * types: a definition's type, the definition the client knows for a type,
 * and a definition's field names (SPEC 5.3). Types only; never exported.
 * @packageDocumentation
 */
import type { TypesOf } from '@netvark/jsonapi-core';

/** An object type's members, written out. */
export type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** A definition's resource type; `never` for no definition. */
export type TypeOf<TDefinition> = TDefinition extends {
  readonly type: infer TType extends string;
}
  ? TType
  : never;

/** The definition the client knows for a type; `never` when it knows none. */
export type KnownDefinition<TKnown, TType> = Extract<
  TKnown,
  { readonly type: TType }
>;

/** The fields of a type a client reads: its attributes and relationships. */
export type FieldNameOf<TDefinition> =
  | (keyof TypesOf<TDefinition>['attributes'] & string)
  | (keyof TypesOf<TDefinition>['relationships'] & string);
