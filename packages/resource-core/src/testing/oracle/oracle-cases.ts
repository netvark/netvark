/**
 * `oracleCases(resources, options)` (SPEC 7.3): what `pg-catalog rules
 * --check` writes into the replayed database for a registry, and how it
 * judges each write (catalog SPEC 10.3, ADR 0006). Each field with a wire
 * form and each relationship a client writes tries its boundary fixtures
 * (15.3); each validator, its fixtures against the CHECK it stands for;
 * each codec, its fixtures through the storage codec `options.storage`
 * gives it, over text, since the probe prints what it stored as text.
 * @packageDocumentation
 */
import type { AnyDeclaredResource } from '../../declare/declared-resource';
import type { TextStorage } from './members';
import type { OracleCase } from './types';

import { checkRegistry } from '../../registry/check-registry';
import { codecCases } from './codec-cases';
import { memberCases } from './member-cases';
import { validatorCases } from './validator-cases';

export interface OracleOptions {
  /**
   * The storage codec of each codec a declared field names, by codec name:
   * `write` gives the text PostgreSQL reads, and `read` takes the text it
   * prints, in a UTC session with ISO dates.
   */
  readonly storage?: TextStorage | undefined;
}

/**
 * The oracle's cases for a registry, in its order: per resource, its
 * fields, relationships, validators, and codecs. Runs the registry checks
 * (SPEC 4.2), so it throws their `TypeError`, and throws one naming the
 * codec a field names when `options.storage` gives it no storage codec.
 */
export function oracleCases(
  resources: ReadonlyArray<AnyDeclaredResource>,
  options: OracleOptions = {},
): ReadonlyArray<OracleCase> {
  const { internals } = checkRegistry('oracleCases', resources, {});
  const storage = options.storage ?? {};
  const seen = new Set<string>();
  const cases: Array<OracleCase> = [];
  for (const each of internals) {
    cases.push(
      ...memberCases(each),
      ...validatorCases(each, storage, seen),
      ...codecCases(each, storage),
    );
  }
  return cases;
}
