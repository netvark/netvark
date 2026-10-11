/**
 * `@netvark/kysely-resource`: the Kysely runtime for `@netvark/resource-core`
 * declarations on PostgreSQL (resource SPEC 18, ADR 0012). The storage
 * adapter runs each operation in one transaction that sets every scope's
 * session parameter for that transaction only, and adds the scope's
 * predicate to every statement on a scoped table.
 * @ref https://kysely.dev/
 * @packageDocumentation
 */
export type { KyselyTransaction } from './storage/transaction';
export type {
  KyselyStorage,
  KyselyStorageOptions,
  ListOptions,
  OutboxTable,
  TextCodec,
} from './storage/types';

export { createKyselyStorage } from './storage/create-storage';
