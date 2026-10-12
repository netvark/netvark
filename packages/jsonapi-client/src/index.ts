/**
 * `@netvark/jsonapi-client`: a typed fetch client for JSON:API 1.1 servers,
 * typed by the `@netvark/jsonapi-core` definitions the server is built
 * from (SPEC 15).
 * @packageDocumentation
 */
export type { RecordOf } from './client/record-types';
export type {
  AnyRecord,
  Deserialized,
  DeserializeOptions,
  Identifier,
  RecordMembers,
} from './document/types';
export type {
  ResponseErrorHeaders,
  ResponseErrorInit,
} from './errors/response-error';
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

export { deserialize } from './document/deserialize';
export { isResponseError, ResponseError } from './errors/response-error';
export { cursorOf, pageCursors } from './pagination/cursors';
export { serializeQuery } from './query/serialize-query';
