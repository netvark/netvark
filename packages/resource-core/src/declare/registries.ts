/**
 * The definer's registries and the context every declaration is checked
 * against (SPEC 2). A codec registry is read for each codec's `types`, a
 * validator registry for its names; `defineCodec` and `defineValidator`
 * (SPEC 7) make the values.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@netvark/catalog-core';

/** What a declaration reads of a codec: the type names it attaches to (SPEC 7.1). */
export interface CodecTypes {
  readonly types: ReadonlyArray<string>;
}

/** Codecs by name. */
export type CodecRegistry = Readonly<Record<string, CodecTypes>>;

/** Validators by name. */
export type ValidatorRegistry = Readonly<Record<string, object>>;

/** A scope: the column that holds the actor's tenant in every scoped table (SPEC 3.2). */
export interface ScopeColumn {
  readonly column: string;
}

/** Scopes by name. */
export type ScopeRegistry = Readonly<Record<string, ScopeColumn>>;

/** The validator covering one domain CHECK without a rule (SPEC 3.6). */
export interface DomainRule {
  readonly validator: string;
}

/** Validators for domain CHECKs, by domain reference name and constraint name. */
export type DomainRules = Readonly<
  Record<string, Readonly<Record<string, DomainRule>>>
>;

/** An empty registry: the default when a definer has none. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a registry the definer leaves out must have no names at all, so naming a codec, validator, scope, or domain rule fails to type-check; a `Record<string, never>` would admit every string
export type EmptyRegistry = Readonly<Record<never, never>>;

/** Everything a declaration is checked against: the catalog and the registries. */
export interface DeclareContext<
  TCatalog extends PublicCatalog = PublicCatalog,
  TCodecs extends CodecRegistry = CodecRegistry,
  TValidators extends ValidatorRegistry = ValidatorRegistry,
  TScopes extends ScopeRegistry = ScopeRegistry,
  TDomains extends DomainRules = DomainRules,
> {
  readonly catalog: TCatalog;
  readonly codecs: TCodecs;
  readonly validators: TValidators;
  readonly scopes: TScopes;
  readonly domains: TDomains;
}
