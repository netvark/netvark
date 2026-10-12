/**
 * `@netvark/jsonapi-client`: a typed fetch client for JSON:API 1.1 servers,
 * typed by the `@netvark/jsonapi-core` definitions the server is built
 * from (SPEC 15).
 * @packageDocumentation
 */
export type { PageCursors } from './pagination/cursors';
export type {
  Condition,
  Conditions,
  CustomValues,
  FieldsInput,
  FilterInput,
  FilterValue,
  FilterValues,
  GetQuery,
  ListQuery,
  PageInput,
  Query,
  TypedFilterInput,
  WideFilterInput,
} from './query/types';

export { cursorOf, pageCursors } from './pagination/cursors';
export { serializeQuery } from './query/serialize-query';
