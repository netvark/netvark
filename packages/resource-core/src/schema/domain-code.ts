/**
 * The code of a domain CHECK covered by a validator (SPEC 3.6, 6.4): its
 * constraint name upper-cased, the derivation of SPEC 4.1, or the `code`
 * the definer gives it. A validator's issues carry it, as a table CHECK's
 * carry the table constraint's code.
 * @packageDocumentation
 */
import type { DomainRule } from '../declare/registries';

import { deriveCode } from '../names/code';

/** The error code of a domain CHECK. */
export function domainCode(constraint: string, rule: DomainRule): string {
  return rule.code ?? deriveCode(constraint);
}
