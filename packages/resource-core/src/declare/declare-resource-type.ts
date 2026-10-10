/**
 * The signature of a configured `declareResource` (SPEC 3).
 * @packageDocumentation
 */
import type { TableName } from '../catalog/types';
import type { DeclarationCheck, IdentityCheck } from './declaration-check';
import type { DeclaredResource } from './declared-resource';
import type { DeclareContext } from './registries';
import type { Declaration } from './types';

/**
 * Declares a resource over `table`. The declaration's literal type is kept
 * (`const`), then held against the exact shape the catalog and the
 * definer's registries allow, so a wrong name fails `tsc` at the option.
 */
export type DeclareResource<TContext extends DeclareContext> = <
  const TTable extends TableName<TContext['catalog']>,
  const TDecl extends Declaration,
>(
  table: TTable & IdentityCheck<TContext, TTable>,
  declaration: TDecl & DeclarationCheck<TContext, TTable, TDecl>,
) => DeclaredResource<TContext, TTable, TDecl>;
