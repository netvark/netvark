/**
 * The type-level check of the definer's `domains` (SPEC 3.6): each key is a
 * domain of the catalog, each constraint one of its CHECKs without a rule,
 * and each validator a name of the validator registry. The runtime twin is
 * `checkDomains` in `check-config.ts`.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicDomain } from '@netvark/catalog-core';

import type { DomainRules, ValidatorRegistry } from './registries';

type UntranslatedDomainCheck<TDomain extends PublicDomain> = {
  [K in keyof TDomain['constraints']]: TDomain['constraints'][K] extends {
    readonly rule: null;
  }
    ? K
    : never;
}[keyof TDomain['constraints']];

/** `domains`, key by key. */
export interface DomainsCheck<
  TCatalog extends PublicCatalog,
  TValidators extends ValidatorRegistry,
  TDomains extends DomainRules,
> {
  readonly domains?:
    | {
        readonly [D in keyof TDomains]: D extends keyof TCatalog['domains']
          ? {
              readonly [
                K in keyof TDomains[D]
              ]: K extends UntranslatedDomainCheck<TCatalog['domains'][D]>
                ? { readonly validator: keyof TValidators & string }
                : `${K & string} is not a CHECK without a rule of domain ${D & string}`;
            }
          : `"${D & string}" is not a domain of the public catalog`;
      }
    | undefined;
}
