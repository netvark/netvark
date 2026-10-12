/**
 * The types a client of a resource reads and writes (SPEC 5.3, ADR 0018):
 * what `defineResource` infers beyond the names a definition's other type
 * parameters keep. A definition carries them as `'~types'`, a type-only
 * member that is always absent at runtime, as Standard Schema carries
 * `types`.
 * @ref https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts (`types`: "Inferred types associated with the schema.")
 * @packageDocumentation
 */
import type {
  InferStandardInput,
  StandardSchema,
} from '../internal/standard-schema-types';
import type { Cardinality } from './types';

/** A relationship as a client sees it: the related type and the cardinality. */
export interface ClientRelationship {
  readonly type: string;
  readonly cardinality: Cardinality;
}

/**
 * What a client reads and writes. Every inferred one is assignable to this
 * wide form, which `AnyResource` carries.
 */
export interface ResourceTypes {
  /** The attributes a client receives, by name, as JSON (`JsonOf`). */
  readonly attributes: object;
  /** By name. */
  readonly relationships: Readonly<Record<string, ClientRelationship>>;
  /** By filterable field: the union of its operators. */
  readonly filter: Readonly<Record<string, string>>;
  /** The union of the declared include paths. */
  readonly include: string;
  /** Whether the definition accepts `fields[type]`. */
  readonly fields: boolean;
  /** Whether the definition has a search parameter. */
  readonly search: boolean;
  /** Whether the definition paginates. */
  readonly page: boolean;
  /** The union of the declared custom parameter names. */
  readonly custom: string;
  /** The attributes a create sends: the create validator's input. */
  readonly create: unknown;
  /** The attributes an update sends: the update validator's input. */
  readonly update: unknown;
  /** The fields a create may carry. */
  readonly creatable: string;
  /** The fields an update may carry. */
  readonly updatable: string;
  /** Whether a create may carry a client-generated id. */
  readonly clientIds: boolean;
}

/** The client types of a definition; the wide `ResourceTypes` for `AnyResource`. */
export type TypesOf<TResource> = TResource extends {
  readonly '~types'?: infer TTypes extends ResourceTypes | undefined;
}
  ? Exclude<TTypes, undefined>
  : ResourceTypes;

type NoJson = bigint | symbol | undefined | ((...args: never) => unknown);

/** An array element: `JSON.stringify` writes `null` for one with no JSON form. */
type JsonElement<T> = T extends NoJson ? null : JsonOf<T>;

type Simplify<T> = { readonly [K in keyof T]: T[K] };

/**
 * An object's JSON form: string keys only, members with no JSON form left
 * out, and a member that may be `undefined` optional, since
 * `JSON.stringify` leaves it out.
 */
type JsonObject<T> = Simplify<
  {
    readonly [
      K in keyof T as K extends string
        ? T[K] extends NoJson
          ? never
          : undefined extends T[K]
            ? never
            : K
        : never
    ]: JsonOf<T[K]>;
  } & {
    readonly [
      K in keyof T as K extends string
        ? T[K] extends NoJson
          ? never
          : undefined extends T[K]
            ? K
            : never
        : never
    ]?: JsonOf<Exclude<T[K], undefined>>;
  }
>;

/**
 * The JSON form of `T`: what `JSON.stringify` writes for a value of `T`, as
 * `JSON.parse` reads it back. `toJSON` applies first, so a `Date` is a
 * string; a bigint, a function, a symbol, or `undefined` has no JSON form;
 * `unknown` stays `unknown`.
 * @ref https://tc39.es/ecma262/#sec-serializejsonproperty
 */
export type JsonOf<T> = unknown extends T
  ? unknown
  : T extends { toJSON(...args: never): infer TJson }
    ? JsonOf<TJson>
    : T extends string | number | boolean | null
      ? T
      : T extends NoJson
        ? never
        : T extends ReadonlyArray<infer TElement>
          ? ReadonlyArray<JsonElement<TElement>>
          : T extends object
            ? JsonObject<T>
            : never;

/**
 * An init member left out: no names and no keys, so nothing is declared
 * through it.
 */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a member the init leaves out must have no keys at all, so it names nothing; a `Record<string, never>` would name every string
export type Empty = Readonly<Record<never, never>>;

/** The attributes `serialize` returns, as JSON; none when it returns none. */
type JsonAttributes<TAttributes> =
  JsonOf<TAttributes> extends infer TJson extends object ? TJson : Empty;

/** A member of an init, `TFallback` when the init does not hold it. */
export type MemberOf<TInit, TKey extends string, TFallback> = TInit extends {
  readonly [K in TKey]: infer TValue;
}
  ? Exclude<TValue, undefined>
  : TFallback;

type FilterTypes<TQuery> =
  MemberOf<TQuery, 'filter', unknown> extends infer TFilter extends Readonly<
    Record<string, ReadonlyArray<string>>
  >
    ? { readonly [K in keyof TFilter]: TFilter[K][number] }
    : Empty;

type ListedNames<TList> =
  TList extends ReadonlyArray<infer TName extends string> ? TName : never;

/** The fields a write's list names, or every field without a list. */
type WritableNames<
  TWritable,
  TOperation extends string,
  TField extends string,
> = TWritable extends {
  readonly [K in TOperation]: ReadonlyArray<infer TName extends string>;
}
  ? TName
  : TField;

/** A validator's input; without one, the attributes the write accepts, each `unknown`. */
type WriteInput<TValidate, TOperation extends string, TAttribute> =
  MemberOf<TValidate, TOperation, undefined> extends infer TSchema extends
    StandardSchema
    ? InferStandardInput<TSchema>
    : { readonly [K in TAttribute & string]?: unknown };

/**
 * The client types `defineResource` infers from an init: `TAttributes` from
 * `serialize`, the relationships, query, validators, and writable lists as
 * the init declares them.
 */
export interface InferredTypes<
  TAttribute extends string,
  TRelationships,
  TAttributes,
  TQuery,
  TValidate,
  TWritable,
  TClientIds extends boolean,
> extends ResourceTypes {
  readonly attributes: JsonAttributes<TAttributes>;
  readonly relationships: {
    readonly [K in keyof TRelationships & string]: {
      readonly type: TRelationships[K] extends {
        readonly type: infer TType extends string;
      }
        ? TType
        : string;
      readonly cardinality: TRelationships[K] extends {
        readonly cardinality: infer TCardinality extends Cardinality;
      }
        ? TCardinality
        : Cardinality;
    };
  };
  readonly filter: FilterTypes<TQuery>;
  readonly include: ListedNames<MemberOf<TQuery, 'include', never>>;
  readonly fields: TQuery extends { readonly fields: false } ? false : true;
  readonly search: TQuery extends { readonly search: string } ? true : false;
  readonly page: TQuery extends { readonly page: object } ? true : false;
  readonly custom: ListedNames<MemberOf<TQuery, 'custom', never>>;
  readonly create: WriteInput<
    TValidate,
    'create',
    WritableNames<TWritable, 'create', TAttribute> & TAttribute
  >;
  readonly update: WriteInput<
    TValidate,
    'update',
    WritableNames<TWritable, 'update', TAttribute> & TAttribute
  >;
  readonly creatable: WritableNames<
    TWritable,
    'create',
    TAttribute | (keyof TRelationships & string)
  >;
  readonly updatable: WritableNames<
    TWritable,
    'update',
    TAttribute | (keyof TRelationships & string)
  >;
  readonly clientIds: TClientIds;
}
