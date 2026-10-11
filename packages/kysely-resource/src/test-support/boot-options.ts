/**
 * The options boot's tests start from (resource SPEC 18.3): the domain's
 * behaviors over a storage whose database never opens, since the static
 * checks run no query, the boot catalog, and the resources that run
 * without a scope. A case changes one thing and reads what boot reports.
 */
import type { RuntimeOptions } from '../runtime/types';
import type { TestDomain } from './domain';

import { bootCatalog } from './boot-catalog';
import { BEHAVIORS, domainOptions } from './domain';
import { domainDatabase, domainStorage } from './domain-database';

/** The unscoped resources of the domain. */
const UNSCOPED: ReadonlyArray<string> = ['workspaces', 'logs'];

const storage = domainStorage(domainDatabase().db);

/** The options as the domain's tests compose it, against the boot catalog. */
export async function bootOptions(): Promise<
  RuntimeOptions<TestDomain, typeof BEHAVIORS>
> {
  return {
    ...domainOptions(storage),
    resources: BEHAVIORS,
    catalog: await bootCatalog(),
    unscoped: UNSCOPED,
  };
}
