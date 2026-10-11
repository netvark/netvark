/**
 * `@netvark/kysely-resource`: the Kysely runtime for `@netvark/resource-core`
 * declarations on PostgreSQL (resource SPEC 18, ADR 0012). The storage
 * adapter runs each operation in one transaction that sets every scope's
 * session parameter for that transaction only, and adds the scope's
 * predicate to every statement on a scoped table. `createResourceRuntime`
 * checks the composition against the catalog and the database, then runs
 * each operation's lifecycle for `runtime.as(actor)`, which HTTP hosts and
 * workers call alike; `checkResourceRuntime` runs the static checks in CI;
 * `relayOutbox` delivers the events operations recorded, after they
 * committed.
 * @ref https://kysely.dev/
 * @packageDocumentation
 */
export type { BootReport } from './boot/report';
export type { OutboxEvent, RelayOptions } from './outbox/relay';
export type {
  Domain,
  ResourceOperations,
  ResourceRuntime,
} from './runtime/operations-types';
export type {
  ResourceInput,
  RuntimeOptions,
  RuntimeResources,
} from './runtime/types';
export type { KyselyTransaction } from './storage/transaction';
export type {
  KyselyStorage,
  KyselyStorageOptions,
  ListOptions,
  OutboxTable,
  TextCodec,
} from './storage/types';

export { checkResourceRuntime } from './boot/check-runtime';
export { BootError } from './boot/report';
export { relayOutbox } from './outbox/relay';
export { createResourceRuntime } from './runtime/create-runtime';
export { createKyselyStorage } from './storage/create-storage';
