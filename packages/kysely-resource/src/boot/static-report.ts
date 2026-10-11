/**
 * The static checks of boot (SPEC 18.3), which read the options and the
 * catalog and run no query.
 * @packageDocumentation
 */
import type { BootContext } from './options';
import type { BootReport } from './report';

import { bindingProblems } from './bindings';
import { indexWarnings } from './index-warnings';
import { outboxProblems } from './outbox-table';
import { rowSecurityProblems } from './row-security';

/** The static problems and warnings of the composition. */
export function staticReport(boot: BootContext): BootReport {
  return Object.freeze({
    problems: Object.freeze([
      ...bindingProblems(boot),
      ...outboxProblems(boot),
      ...rowSecurityProblems(boot),
    ]),
    warnings: Object.freeze([...indexWarnings(boot)]),
  });
}
