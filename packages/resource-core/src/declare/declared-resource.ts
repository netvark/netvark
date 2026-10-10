/**
 * The declared resource (SPEC 3): what `declareResource` returns. Its
 * identity is a private brand, a `WeakMap` membership, so a lookalike
 * object is never taken for a declaration where a registry is assembled;
 * the map also keeps what the `testing` entry reads and the public object
 * does not show: the member specs and the catalog.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@netvark/catalog-core';

import type { ErrorEntry } from '../errors/error-entry';
import type { ResourceErrors } from '../errors/error-types';
import type { ResourceNames } from '../names/types';
import type { AttributeValidators } from '../schema/attribute-schemas';
import type { ObjectSchemas } from '../schema/object-schemas';
import type { ResourceSpecs } from '../schema/resource-specs';
import type {
  TypedObjectSchemas,
  TypedValidators,
  TypedWrite,
  TypesOf,
} from '../schema/resource-types';
import type { WriteValidators } from '../schema/write-schemas';
import type { DeclareContext } from './registries';
import type { Declaration } from './types';

/** The schemas' types: wide for a resource whose table TypeScript does not know, typed by the catalog otherwise. */
type Typed<TTable extends string, TWide, TTyped> = string extends TTable
  ? TWide
  : TTyped;

type Types<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = TypesOf<TContext, TTable, TDecl>;

/** A resource declared over one table of the public catalog. */
export interface DeclaredResource<
  TContext extends DeclareContext = DeclareContext,
  TTable extends string = string,
  TDecl extends Declaration = Declaration,
> {
  /** The catalog key of the table. */
  readonly table: TTable;
  /** The declaration as given, frozen. */
  readonly declaration: TDecl;
  /** The public names and both directions of each mapping (SPEC 4.3). */
  readonly names: ResourceNames;
  /** Each derived error code's status, title, constraint kind, and the members its items point at (SPEC 9.1). */
  readonly errors: Typed<
    TTable,
    Readonly<Record<string, ErrorEntry>>,
    ResourceErrors<TContext, TTable, TDecl>
  >;
  /** The read, create, and update schemas of the attributes (SPEC 6.2), built on first read. */
  readonly schema: Typed<
    TTable,
    ObjectSchemas,
    TypedObjectSchemas<
      Types<TContext, TTable, TDecl>['read'],
      Types<TContext, TTable, TDecl>['create'],
      Types<TContext, TTable, TDecl>['update']
    >
  >;
  /** `schema.create` and `schema.update` as Standard Schema validators (SPEC 6.5). */
  readonly validate: Typed<
    TTable,
    AttributeValidators,
    TypedValidators<
      Types<TContext, TTable, TDecl>['create'],
      Types<TContext, TTable, TDecl>['update']
    >
  >;
  /**
   * The read, create, and update schemas of the relationships (SPEC 6.2),
   * built on first read, which reads every target (SPEC 3.8).
   */
  readonly linkage: Typed<
    TTable,
    ObjectSchemas,
    TypedObjectSchemas<
      Types<TContext, TTable, TDecl>['linkage']['read'],
      Types<TContext, TTable, TDecl>['linkage']['create'],
      Types<TContext, TTable, TDecl>['linkage']['update']
    >
  >;
  /** A create or an update as `{ attributes, relationships }`, with the CHECKs spanning both (SPEC 6.2). */
  readonly write: Typed<
    TTable,
    WriteValidators,
    TypedWrite<Types<TContext, TTable, TDecl>>
  >;
  /**
   * Type-only: the definer's catalog and registries, for type helpers such as
   * `Infer`. Always absent at runtime.
   */
  readonly '~context'?: TContext | undefined;
}

/** What a declared resource was built from, beyond its public members. */
export interface DeclaredInternals {
  /** The resource itself, so one lookup gives a registry both. */
  readonly resource: DeclaredResource;
  readonly specs: ResourceSpecs;
  readonly catalog: PublicCatalog;
  /** Each error code's origin, the constraint behind it, for the registry checks (SPEC 4.2). */
  readonly errorOrigins: ReadonlyMap<string, string>;
}

const DECLARED = new WeakMap<object, DeclaredInternals>();

/** Brands a resource built by `declareResource`. */
export function brandDeclared<TResource extends DeclaredResource>(
  resource: TResource,
  internals: Omit<DeclaredInternals, 'resource'>,
): TResource {
  DECLARED.set(resource, { ...internals, resource });
  return resource;
}

/** Whether a value was returned by a `declareResource`. */
export function isDeclaredResource(value: unknown): value is DeclaredResource {
  return typeof value === 'object' && value !== null && DECLARED.has(value);
}

/** What a resource `declareResource` returned was built from; `undefined` for any other value. */
export function internalsOf(value: unknown): DeclaredInternals | undefined {
  return typeof value === 'object' && value !== null
    ? DECLARED.get(value)
    : undefined;
}
