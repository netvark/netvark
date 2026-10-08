/**
 * hono-jsonapi: JSON:API 1.1 for Hono. Resource definitions, document
 * building, query parsing, request document parsing, content negotiation,
 * the Cursor Pagination profile, and the Hono integration. The Atomic
 * Operations extension lives in `hono-jsonapi/atomic`.
 * @ref https://jsonapi.org/format/1.1/
 * @packageDocumentation
 */
export type { DocumentOptions, Included } from './document/build';
export type {
  AnyResourceIdentifier,
  Attributes,
  CollectionDocument,
  DataDocument,
  Document,
  DocumentBase,
  ErrorDocument,
  ErrorLinks,
  ErrorObject,
  ErrorSource,
  ExtensionDocument,
  JsonApiObject,
  Link,
  LinkObject,
  Links,
  LocalResourceIdentifier,
  Meta,
  MetaDocument,
  PrimaryData,
  Relationship,
  Relationships,
  ResourceDocument,
  ResourceIdentifier,
  ResourceLinkage,
  ResourceObject,
  ToManyLinkage,
  ToManyRelationshipDocument,
  ToOneLinkage,
  ToOneRelationshipDocument,
} from './document/types';
export type { CatalogEntry, ErrorCode } from './errors/catalog';
export type {
  ErrorObjectInit,
  JsonApiErrorOptions,
} from './errors/json-api-error';
export type { ErrorStatusCode } from './errors/status';
export type { ErrorHandlerOptions } from './hono/handlers';
export type { JsonApiOptions } from './hono/middleware';
export type { JsonApiResponse, ResponseHeaders } from './hono/respond';
export type {
  JsonApiContext,
  JsonApiEnv,
  JsonApiVariables,
} from './hono/types';
export type {
  BodyValidation,
  BodyValidatorOptions,
  CreateBodyOptions,
  QueryValidation,
  UpdateBodyOptions,
} from './hono/validators';
export type {
  InferStandardInput,
  InferStandardOutput,
  StandardSchema,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaOptions,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
} from './internal/standard-schema-types';
export type {
  JsonApiMediaTypeInit,
  JsonApiParameters,
} from './media-type/json-api';
export type {
  MediaRange,
  MediaType,
  MediaTypeParameter,
} from './media-type/parse';
export type {
  NegotiatedRequest,
  Negotiation,
  NegotiationFailure,
  NegotiationHeaders,
  NegotiationOptions,
  NegotiationSuccess,
} from './negotiate/negotiate';
export type {
  PageCursors,
  PageLinksOptions,
  PageMetaInit,
} from './pagination/links';
export type { Page, PaginatedOptions } from './pagination/paginated';
export type {
  FilterCondition,
  PageRequest,
  ParameterValue,
  ParsedFilter,
  ParsedQuery,
  QueryInput,
  SortField,
} from './query/types';
export type { IdentifierOptions, RequestLinkage } from './request/identifiers';
export type { RelationshipDocumentOptions } from './request/relationship-document';
export type {
  LidOptions,
  ParsedResourceObject,
  WithLids,
  WithoutLids,
} from './request/resource-document';
export type {
  Operation,
  ParseResourceOptions,
  RequestDocument,
  RequestResourceObject,
} from './request/types';
export type {
  AnyResource,
  Cardinality,
  CreateAttributesOf,
  LinkageInit,
  PageCapabilities,
  PageCapabilitiesInit,
  QueryCapabilities,
  QueryCapabilitiesInit,
  RelationshipDefinition,
  RelationshipInit,
  RelationshipLinks,
  RelationshipNameOf,
  ResourceDefinition,
  ResourceDefinitionInit,
  ResourceLinks,
  ResourceValidators,
  RowOf,
  SearchParameter,
  SerializedAttributes,
  SerializedRelationship,
  SerializedRelationships,
  SerializedResource,
  UpdateAttributesOf,
} from './resource/types';

export {
  collectionDocument,
  include,
  jsonApiObject,
  resourceDocument,
  toManyRelationshipDocument,
  toOneRelationshipDocument,
} from './document/build';
export { assertFullLinkage } from './document/linkage';
export {
  assertMemberName,
  isAtMember,
  isExtensionMemberName,
  isMemberName,
  isMemberPath,
} from './document/member-name';
export { applyFields, identify, serializeResource } from './document/serialize';
export { ERROR_CATALOG, ERROR_CODES } from './errors/catalog';
export {
  JsonApiError,
  errorDocument,
  errorObject,
  isJsonApiError,
  responseStatus,
} from './errors/json-api-error';
export { isErrorStatusCode, reasonPhrase } from './errors/status';
export { readDocument } from './hono/body';
export { errorHandler, notFoundHandler, toJsonApiError } from './hono/handlers';
export { jsonApi } from './hono/middleware';
export {
  isJsonApiResponse,
  respond,
  respondError,
  varyAccept,
} from './hono/respond';
export {
  bodyValidator,
  queryValidator,
  relationshipValidator,
} from './hono/validators';
export {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  JSON_API_MEDIA_TYPE,
  JSON_API_VERSION,
} from './internal/constants';
export {
  formatJsonApiMediaType,
  isJsonApiMediaType,
  jsonApiParameters,
} from './media-type/json-api';
export { parseAccept, parseMediaType } from './media-type/parse';
export { negotiate } from './negotiate/negotiate';
export {
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
  invalidCursor,
  invalidCursorError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSort,
  unsupportedSortError,
} from './pagination/errors';
export { itemCursorMeta, pageMeta, paginationLinks } from './pagination/links';
export { paginatedDocument } from './pagination/paginated';
export { parseQuery } from './query/parse-query';
export { toManyLinkage, toOneLinkage } from './request/cardinality';
export { parseIdentifier, parseLinkage } from './request/identifiers';
export {
  parseToManyRelationshipDocument,
  parseToOneRelationshipDocument,
} from './request/relationship-document';
export {
  parseCreateDocument,
  parseResourceObject,
  parseUpdateDocument,
  primaryData,
} from './request/resource-document';
export { defineResource, relatedResource } from './resource/define-resource';
