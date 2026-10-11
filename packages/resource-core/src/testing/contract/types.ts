/**
 * What the storage contract suite (SPEC 12.9) gives an adapter package and
 * what it takes from one. A case throws on failure and imports no test
 * runner, so the package runs the cases under its own:
 * `for (const c of storageContract(harness)) it(c.name, c.run)`.
 * @packageDocumentation
 */
import type { DomainEvent } from '../../server/event';
import type { StorageAdapter } from '../../server/storage';

/** One case: its name, starting with the obligation of SPEC 12.8 it checks, and a run that rejects on failure. */
export interface ContractCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

/** The adapter under test and the hooks the cases need around it. */
export interface ContractHarness<TTransaction> {
  /**
   * An adapter connected to a database holding `contractFixture.migrations`,
   * reading the fixture's catalog, with a storage codec for `point`, and
   * an outbox `events` reads.
   */
  readonly adapter: StorageAdapter<TTransaction>;
  /** Returns the database to the seed: runs `contractFixture.seed` and empties the outbox. Each case calls it first. */
  readonly reset: () => Promise<void>;
  /** The events committed to the outbox, in the order they were recorded. */
  readonly events: () => Promise<ReadonlyArray<DomainEvent>>;
}
