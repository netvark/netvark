/**
 * `@netvark/react-resource/query`: TanStack Query's options for a
 * client's reads and writes (resource SPEC 20.6), keyed by the request.
 * `resourceQueries` makes them from a client `createClients` returned.
 * TanStack Query is an optional peer, which only this entry imports.
 * @packageDocumentation
 */
export type { PageParam } from './pages';
export type {
  AllKey,
  GetKey,
  KeyedDefinition,
  ListKey,
  PagesKey,
} from './query-keys';
export type {
  ListResult,
  PagesOptions,
  ReadOptions,
  ResourceQueries,
  UpdateVariables,
  WriteOptions,
  WriteSettings,
} from './query-types';

export { resourceQueries } from './queries';
