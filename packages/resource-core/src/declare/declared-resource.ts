/**
 * The declared resource (SPEC 3): what `declareResource` returns. Its
 * identity is a private brand, a `WeakSet` membership, so a lookalike object
 * is never taken for a declaration where a registry is assembled.
 * @packageDocumentation
 */
import type { ResourceNames } from '../names/types';
import type { DeclareContext } from './registries';
import type { Declaration } from './types';

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
  /**
   * Type-only: the definer's catalog and registries, for type helpers such as
   * `Infer`. Always absent at runtime.
   */
  readonly '~context'?: TContext | undefined;
}

const DECLARED = new WeakSet<object>();

/** Brands a resource built by `declareResource`. */
export function brandDeclared<TResource extends DeclaredResource>(
  resource: TResource,
): TResource {
  DECLARED.add(resource);
  return resource;
}

/** Whether a value was returned by a `declareResource`. */
export function isDeclaredResource(value: unknown): value is DeclaredResource {
  return typeof value === 'object' && value !== null && DECLARED.has(value);
}
