/**
 * The storages `createKyselyStorage` made, each with the options it uses.
 * The runtime takes only these (ADR 0012): it reaches the adapter's
 * statements beyond the contract, such as the lookup of a relationship's
 * target, through the options a storage was made with, which the storage
 * itself does not expose.
 * @packageDocumentation
 */
import type { StorageConfig } from './options';
import type { KyselyStorage } from './types';

const CONFIGS = new WeakMap<object, StorageConfig>();

/** Records that `storage` runs on `config`. */
export function registerStorage(
  storage: KyselyStorage,
  config: StorageConfig,
): void {
  CONFIGS.set(storage, config);
}

/** The options `storage` was made with, or `undefined` when `createKyselyStorage` did not make it. */
export function storageConfigOf(storage: unknown): StorageConfig | undefined {
  return typeof storage === 'object' && storage !== null
    ? CONFIGS.get(storage)
    : undefined;
}
