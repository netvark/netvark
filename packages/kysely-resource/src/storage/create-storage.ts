/**
 * `createKyselyStorage(options)` (SPEC 18.2): the storage adapter of
 * resource SPEC 12.8 over Kysely. Creating it checks the options and runs
 * no query; every statement runs on `db.withoutPlugins()`, so a plugin of
 * the application's, such as `CamelCasePlugin`, never renames the
 * adapter's identifiers or result keys.
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/Kysely.html#withoutplugins
 * @packageDocumentation
 */
import type { KyselyStorage, KyselyStorageOptions } from './types';

import { storageConfig } from './options';
import { KyselyTransaction } from './transaction';

/** The storage adapter over `options.db`; throws `TypeError` for an option it cannot use. */
export function createKyselyStorage<TDatabase>(
  options: KyselyStorageOptions<TDatabase>,
): KyselyStorage {
  const config = storageConfig(options);
  const storage: KyselyStorage = {
    catalog: config.catalog,
    outbox: config.outbox,
    transaction: async (scopes, run) =>
      KyselyTransaction.run(config.db, scopes, run),
  };
  return Object.freeze(storage);
}
