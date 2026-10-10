/**
 * `Infer<typeof Contacts>` (SPEC 6.2): the output types of a declared
 * resource's schemas, `{ read, create, update, linkage: { read, create,
 * update } }`, keyed by public name.
 * @packageDocumentation
 */
import type {
  AnyDeclaredResource,
  DeclaredResource,
} from '../declare/declared-resource';
import type { TypesOf } from './resource-types';

/** The output types of a declared resource's schemas. */
export type Infer<TResource extends AnyDeclaredResource> =
  TResource extends DeclaredResource<infer TContext, infer TTable, infer TDecl>
    ? TypesOf<TContext, TTable, TDecl>
    : never;
