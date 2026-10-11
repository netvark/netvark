/**
 * `storageContract(harness)` (SPEC 12.9): the cases a storage adapter runs
 * to show it keeps the obligations of SPEC 12.8, one or more per
 * obligation, each named after it. Every case resets the database first.
 * The cases of obligation 5, paging `list` with the keyset definition,
 * arrive with that definition (SPEC 11.2).
 * @packageDocumentation
 */
import type { ContractCase, ContractHarness } from './contract/types';

import { contractOf } from './contract/context';
import { errorCases } from './contract/error-cases';
import { eventCases } from './contract/event-cases';
import { lockCases } from './contract/lock-cases';
import { partitionCases } from './contract/partition-cases';
import { quotaCases } from './contract/quota-cases';
import { readCases } from './contract/read-cases';
import { scopeCases } from './contract/scope-cases';
import { transactionCases } from './contract/transaction-cases';
import { writeCases } from './contract/write-cases';

/**
 * The contract's cases over `harness`, in the order of the obligations.
 * Each throws on failure and imports no test runner:
 * `for (const c of storageContract(harness)) it(c.name, c.run)`.
 */
export function storageContract<TTransaction>(
  harness: ContractHarness<TTransaction>,
): ReadonlyArray<ContractCase> {
  const contract = contractOf(harness);
  const cases = [
    ...transactionCases(contract),
    ...scopeCases(contract),
    ...readCases(contract),
    ...writeCases(contract),
    ...errorCases(contract),
    ...quotaCases(contract),
    ...eventCases(contract),
    ...lockCases(contract),
    ...partitionCases(contract),
  ];
  return Object.freeze(
    cases.map(({ name, run }) =>
      Object.freeze({
        name,
        run: async () => {
          await harness.reset();
          await run();
        },
      }),
    ),
  );
}
