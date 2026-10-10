/**
 * `createDeclareResource` (SPEC 2): binds `declareResource` to the public
 * catalog and the application's registries, once, in the module that
 * exports the configured definer. Nothing lives in module-level state, so
 * two applications in one process cannot collide.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@netvark/catalog-core';
import type {
  PageCapabilitiesInit,
  ResourceLinksInit,
} from '@netvark/jsonapi-core';

import type { DeclareResource } from './declare-resource-type';
import type { DomainsCheck } from './domains-check';
import type {
  CodecRegistry,
  DeclareContext,
  DomainRules,
  EmptyRegistry,
  ScopeRegistry,
  ValidatorRegistry,
} from './registries';
import type { Requirement } from './requirement';

import { checkDefinerConfig } from './check-config';
import { declareResourceIn } from './declare-resource';

/**
 * A full catalog has `schemas`, which the public catalog drops; the
 * definer takes the public catalog only, since declarations reach browsers
 * (SPEC 2, ADR 0002).
 */
interface NotFullCatalog {
  readonly schemas?: Requirement<'catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers'>;
}

/** What `createDeclareResource` takes. */
export interface DeclareResourceConfig<
  TCatalog extends PublicCatalog,
  TCodecs extends CodecRegistry,
  TValidators extends ValidatorRegistry,
  TScopes extends ScopeRegistry,
  TDomains extends DomainRules,
> {
  /** The generated public catalog (`toPublicCatalog`), `as const`. */
  readonly catalog: TCatalog;
  readonly codecs?: TCodecs | undefined;
  readonly validators?: TValidators | undefined;
  /** Scope names to the column holding the actor's tenant (SPEC 3.2). */
  readonly scopes?: TScopes | undefined;
  /** Validators for domain CHECKs without a rule (SPEC 3.6). */
  readonly domains?: TDomains | undefined;
  /** Merged under every declaration's links (`@netvark/jsonapi-core`). */
  readonly links?: ResourceLinksInit | undefined;
  /** Merged under every declaration's `page`, member by member. */
  readonly page?: PageCapabilitiesInit | undefined;
}

/**
 * Returns a `declareResource` whose argument types come from the catalog
 * and the registries. The configuration is checked here, at startup; a full
 * catalog is refused, since declarations reach browsers (ADR 0002).
 */
export function createDeclareResource<
  const TCatalog extends PublicCatalog & NotFullCatalog,
  const TCodecs extends CodecRegistry = EmptyRegistry,
  const TValidators extends ValidatorRegistry = EmptyRegistry,
  const TScopes extends ScopeRegistry = EmptyRegistry,
  const TDomains extends DomainRules = EmptyRegistry,
>(
  config: DeclareResourceConfig<
    TCatalog,
    TCodecs,
    TValidators,
    TScopes,
    TDomains
  > &
    DomainsCheck<TCatalog, TCodecs, TValidators, TDomains>,
): DeclareResource<
  DeclareContext<TCatalog, TCodecs, TValidators, TScopes, TDomains>
> {
  const context = checkDefinerConfig(config);
  const declareResource = (table: unknown, declaration: unknown) =>
    declareResourceIn(context, table, declaration);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: one runtime function serves every instantiation of the generic signature; the type tests (declare-resource.test-d.ts, create-declare-resource.test-d.ts) hold the static side
  return declareResource as DeclareResource<
    DeclareContext<TCatalog, TCodecs, TValidators, TScopes, TDomains>
  >;
}
