/**
 * `createResourceRuntime(options)` (SPEC 18.3, 18.4): every boot check,
 * then the domain. The static checks read the options and the catalog;
 * the connected ones ask the database, on the storage's connection, what
 * only it knows about the role and each scoped table. Any problem rejects
 * with a `BootError` listing them all; otherwise the runtime carries the
 * warnings and `as(actor)`, which HTTP hosts and workers call alike.
 * @packageDocumentation
 */
import type { DomainShape } from '@netvark/resource-core/server';

import type { Domain, ResourceRuntime } from './operations-types';
import type { RuntimeOptions, RuntimeResources } from './types';

import { connectedProblems } from '../boot/connected';
import { bootContext } from '../boot/options';
import { BootError } from '../boot/report';
import { staticReport } from '../boot/static-report';
import { createDomain } from './domain';

/**
 * Checks the composition, statically and then on the database, and
 * resolves to the runtime; rejects with `BootError` naming every problem.
 * Throws `TypeError` for an option it cannot use, before any check.
 */
export async function createResourceRuntime<
  TDomain extends DomainShape,
  TResources extends RuntimeResources<TDomain>,
>(
  options: RuntimeOptions<TDomain, TResources>,
): Promise<ResourceRuntime<TDomain, TResources>> {
  const boot = bootContext('createResourceRuntime', options);
  const report = staticReport(boot);
  const problems = [...report.problems, ...(await connectedProblems(boot))];
  if (problems.length > 0) {
    throw new BootError(problems);
  }
  const domain = createDomain(options);
  return Object.freeze({
    warnings: report.warnings,
    as: (actor: TDomain['actor']) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the domain holds, under each key of resources, which boot held to the behavior's type, exactly the operations the declaration declares and include when a relationship is includable, as Domain types them
      domain(actor) as unknown as Domain<TResources>,
  });
}
