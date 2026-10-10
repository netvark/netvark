/**
 * Validator middleware (SPEC 10.4), in the shape of Hono's own `validator`:
 * each parses one part of the request against a resource definition, stores
 * the result for `c.req.valid()`, and throws the parser's `BanError` for
 * `app.onError` to render; Hono's default error handler answers it through
 * `getResponse()`, so a rejection is JSON:API even without `errorHandler()`.
 * @ref https://hono.dev/docs/guides/validation
 * @packageDocumentation
 */
import type { Context, Env, MiddlewareHandler, ValidationTargets } from 'hono';

import type {
  AnyResource,
  CreateAttributesOf,
  ParsedQuery,
  ParsedResourceObject,
  RelationshipNameOf,
  RequestDocument,
  ResourceDefinition,
  ResourceIdentifier,
  UpdateAttributesOf,
} from '@netvark/jsonapi-core';

import { createMiddleware } from 'hono/factory';

import {
  parseCreateDocument,
  parseQuery,
  parseToManyRelationshipDocument,
  parseToOneRelationshipDocument,
  parseUpdateDocument,
} from '@netvark/jsonapi-core';

import { readDocument } from './body';

export interface QueryValidation<TSort extends string, TFilter extends string> {
  readonly in: { readonly query: ValidationTargets['query'] };
  readonly out: { readonly query: ParsedQuery<TSort, TFilter> };
}

export interface BodyValidation<TOutput> {
  readonly in: { readonly json: RequestDocument };
  readonly out: { readonly json: TOutput };
}

export interface CreateBodyOptions {
  readonly operation: 'create';
}

export interface UpdateBodyOptions {
  readonly operation: 'update';
  /** The route parameter naming the resource; its value must equal `data.id`. Default `id`. */
  readonly param?: string | undefined;
}

export type BodyValidatorOptions = CreateBodyOptions | UpdateBodyOptions;

type Linkage = ResourceIdentifier | null | ReadonlyArray<ResourceIdentifier>;

const DEFAULT_ID_PARAM = 'id';

/**
 * `HonoRequest.addValidatedData` as a structural type: Hono declares `data`
 * as `{}`, which excludes the `null` of an empty to-one relationship that
 * `c.req.valid()` still returns fine. The method form keeps it assignable.
 */
interface ValidatedStore {
  addValidatedData(target: keyof ValidationTargets, data: unknown): void;
}

function queryString(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? '' : url.slice(index + 1);
}

/**
 * Parses the query parameters with `parseQuery(resource, ...)` and stores a
 * `ParsedQuery` under `c.req.valid('query')`.
 */
export function queryValidator<
  TSort extends string,
  TFilter extends string,
  E extends Env = Env,
  P extends string = string,
>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    unknown,
    TSort,
    TFilter,
    unknown,
    unknown
  >,
): MiddlewareHandler<E, P, QueryValidation<TSort, TFilter>> {
  return createMiddleware<E, P, QueryValidation<TSort, TFilter>>(
    async (c, next) => {
      const store: ValidatedStore = c.req;
      store.addValidatedData(
        'query',
        parseQuery(resource, queryString(c.req.url)),
      );
      await next();
    },
  );
}

/**
 * Reads and parses the request document as a create (`POST`) or update
 * (`PATCH`) of `resource`, storing the `ParsedResourceObject` under
 * `c.req.valid('json')`. An update takes the id from the route parameter
 * (`id` unless `param` says otherwise); the document's `id` must match.
 */
export function bodyValidator<
  TResource extends AnyResource,
  E extends Env = Env,
  P extends string = string,
>(
  resource: TResource,
  options: CreateBodyOptions,
): MiddlewareHandler<
  E,
  P,
  BodyValidation<ParsedResourceObject<CreateAttributesOf<TResource>>>
>;
export function bodyValidator<
  TResource extends AnyResource,
  E extends Env = Env,
  P extends string = string,
>(
  resource: TResource,
  options: UpdateBodyOptions,
): MiddlewareHandler<
  E,
  P,
  BodyValidation<ParsedResourceObject<UpdateAttributesOf<TResource>>>
>;
export function bodyValidator<E extends Env, P extends string>(
  resource: AnyResource,
  options: BodyValidatorOptions,
): MiddlewareHandler<E, P, BodyValidation<ParsedResourceObject<unknown>>> {
  const parse = async (
    c: Context<E>,
  ): Promise<ParsedResourceObject<unknown>> => {
    const body = await readDocument(c);
    if (options.operation === 'create') {
      return parseCreateDocument(resource, body);
    }
    const param = options.param ?? DEFAULT_ID_PARAM;
    const id = c.req.param(param);
    if (id === undefined) {
      throw new TypeError(
        `bodyValidator: the route has no ":${param}" parameter to match data.id against`,
      );
    }
    return parseUpdateDocument(resource, body, id);
  };
  return createMiddleware<E, P, BodyValidation<ParsedResourceObject<unknown>>>(
    async (c, next) => {
      const store: ValidatedStore = c.req;
      store.addValidatedData('json', await parse(c));
      await next();
    },
  );
}

/**
 * Reads and parses a relationship document for `resource`'s relationship
 * `name`, storing the linkage under `c.req.valid('json')`. The cardinality
 * is explicit so the stored type is exact; it must match the definition.
 */
export function relationshipValidator<
  TResource extends AnyResource,
  E extends Env = Env,
  P extends string = string,
>(
  resource: TResource,
  name: RelationshipNameOf<TResource>,
  cardinality: 'one',
): MiddlewareHandler<E, P, BodyValidation<ResourceIdentifier | null>>;
export function relationshipValidator<
  TResource extends AnyResource,
  E extends Env = Env,
  P extends string = string,
>(
  resource: TResource,
  name: RelationshipNameOf<TResource>,
  cardinality: 'many',
): MiddlewareHandler<E, P, BodyValidation<ReadonlyArray<ResourceIdentifier>>>;
export function relationshipValidator<E extends Env, P extends string>(
  resource: AnyResource,
  name: string,
  cardinality: 'one' | 'many',
): MiddlewareHandler<E, P, BodyValidation<Linkage>> {
  const definition = Object.hasOwn(resource.relationships, name)
    ? resource.relationships[name]
    : undefined;
  if (definition === undefined) {
    throw new TypeError(
      `relationshipValidator: "${resource.type}" has no relationship "${name}"`,
    );
  }
  if (definition.cardinality !== cardinality) {
    throw new TypeError(
      `relationshipValidator: "${resource.type}.${name}" is to-${definition.cardinality}, not to-${cardinality}`,
    );
  }
  const { type } = definition;
  const parse = async (c: Context<E>): Promise<Linkage> => {
    const body = await readDocument(c);
    return cardinality === 'one'
      ? parseToOneRelationshipDocument(body, { type })
      : parseToManyRelationshipDocument(body, { type });
  };
  return createMiddleware<E, P, BodyValidation<Linkage>>(async (c, next) => {
    const store: ValidatedStore = c.req;
    store.addValidatedData('json', await parse(c));
    await next();
  });
}
