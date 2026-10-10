/**
 * Request resource documents (SPEC 9.2): the body of a `POST` to a
 * collection or a `PATCH` to a resource, and the `data` of an atomic `add`
 * or `update`. Structure is checked against the specification, field names
 * against the definition, and attribute values against the definition's
 * Standard Schema validator; every problem carries an RFC 6901 pointer.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/format/1.1/#crud-updating-resource-relationships
 * @packageDocumentation
 */
import type { ErrorItem } from 'ban-kit';

import type { Meta, ResourceLinkage } from '../document/types';
import type { StandardSchema } from '../internal/standard-schema-types';
import type {
  AnyResource,
  CreateAttributesOf,
  UpdateAttributesOf,
} from '../resource/types';
import type { RequestLinkage } from './identifiers';
import type { ParseResourceOptions } from './types';

import { isAtMember } from '../document/member-name';
import { errorItem, jsonApiError } from '../errors/json-api-error';
import { hasOwnMember, isRecord, ownMember } from '../internal/object';
import { pointer as toPointer } from '../internal/pointer';
import { invalidDocument } from './identifiers';
import {
  RESOURCE_MEMBERS,
  parseAttributeNames,
  parseIdentity,
  parseRelationships,
} from './resource-members';

/**
 * Options for a parse that may accept `lid`, and the typing it implies:
 * linkage may then name resources by `lid` (`RequestLinkage`); otherwise
 * every identifier carries an `id` (`ResourceLinkage`).
 */
export type LidOptions = Omit<ParseResourceOptions, 'operation' | 'id'>;
export type WithLids = LidOptions & { readonly lids: true };
export type WithoutLids = LidOptions & { readonly lids?: false | undefined };

export interface ParsedResourceObject<
  TAttributes,
  TLinkage extends RequestLinkage = ResourceLinkage,
> {
  readonly type: string;
  readonly id: string | undefined;
  readonly lid: string | undefined;
  /** The validator's output, or the attributes as sent when there is none. */
  readonly attributes: TAttributes;
  /** Only the relationships the document carried, each with its linkage. */
  readonly relationships: Readonly<Record<string, TLinkage>>;
  readonly meta: Meta | undefined;
}

/**
 * Runs the Standard Schema validator; issues become 422 error items whose
 * pointer is the attributes pointer plus the issue path.
 */
async function validateAttributes(
  schema: StandardSchema<unknown, unknown> | undefined,
  attributes: Record<string, unknown>,
  pointer: string,
): Promise<unknown> {
  if (schema === undefined) {
    return attributes;
  }
  const result = await schema['~standard'].validate(attributes);
  if (result.issues === undefined) {
    return result.value;
  }
  throw jsonApiError(
    result.issues.map((issue) =>
      errorItem('VALIDATION_FAILED', {
        detail: issue.message,
        source: {
          pointer:
            pointer +
            toPointer(
              (issue.path ?? []).map((segment) =>
                typeof segment === 'object'
                  ? String(segment.key)
                  : String(segment),
              ),
            ),
        },
      }),
    ),
  );
}

/**
 * Parses the resource object at `options.pointer` (default `/data`). Throws
 * `BanError`: 400 for structure, 403 for a client-generated id the
 * definition does not accept, 409 for a type or id mismatch, 422 for
 * attribute validation issues.
 */
export async function parseResourceObject(
  resource: AnyResource,
  value: unknown,
  options: ParseResourceOptions,
): Promise<ParsedResourceObject<unknown, RequestLinkage>> {
  const pointer = options.pointer ?? '/data';
  if (!isRecord(value)) {
    throw jsonApiError(
      invalidDocument(pointer, 'Primary data must be a single resource object'),
    );
  }
  const errors: Array<ErrorItem> = [];
  const identity = parseIdentity(resource, value, options, pointer, errors);
  for (const name of Object.keys(value)) {
    if (!RESOURCE_MEMBERS.has(name) && !isAtMember(name)) {
      errors.push(
        invalidDocument(
          `${pointer}/${toPointer([name]).slice(1)}`,
          `"${name}" is not a resource object member`,
        ),
      );
    }
  }
  const meta = ownMember(value, 'meta');
  if (hasOwnMember(value, 'meta') && !isRecord(meta)) {
    errors.push(invalidDocument(`${pointer}/meta`, 'meta must be an object'));
  }
  const attributes = parseAttributeNames(
    resource,
    ownMember(value, 'attributes'),
    `${pointer}/attributes`,
    errors,
  );
  const relationships = parseRelationships(
    resource,
    ownMember(value, 'relationships'),
    options,
    `${pointer}/relationships`,
    errors,
  );
  if (errors.length > 0) {
    throw jsonApiError(errors);
  }
  const schema =
    options.operation === 'create'
      ? resource.validate.create
      : resource.validate.update;
  return {
    type: resource.type,
    id: identity.id,
    lid: identity.lid,
    attributes: await validateAttributes(
      schema,
      attributes,
      `${pointer}/attributes`,
    ),
    relationships,
    meta: isRecord(meta) ? meta : undefined,
  };
}

/** A `POST` body: `{ data: resourceObject }` for `resource`. */
export function parseCreateDocument<TResource extends AnyResource>(
  resource: TResource,
  body: unknown,
  options: WithLids,
): Promise<ParsedResourceObject<CreateAttributesOf<TResource>, RequestLinkage>>;
export function parseCreateDocument<TResource extends AnyResource>(
  resource: TResource,
  body: unknown,
  options?: WithoutLids,
): Promise<ParsedResourceObject<CreateAttributesOf<TResource>>>;
export async function parseCreateDocument(
  resource: AnyResource,
  body: unknown,
  options: LidOptions = {},
): Promise<ParsedResourceObject<unknown, RequestLinkage>> {
  return parseResourceObject(resource, primaryData(body), {
    ...options,
    operation: 'create',
  });
}

/** A `PATCH` body: `{ data: resourceObject }` whose `id` must equal `id`. */
export function parseUpdateDocument<TResource extends AnyResource>(
  resource: TResource,
  body: unknown,
  id: string,
  options: WithLids,
): Promise<ParsedResourceObject<UpdateAttributesOf<TResource>, RequestLinkage>>;
export function parseUpdateDocument<TResource extends AnyResource>(
  resource: TResource,
  body: unknown,
  id: string,
  options?: WithoutLids,
): Promise<ParsedResourceObject<UpdateAttributesOf<TResource>>>;
export async function parseUpdateDocument(
  resource: AnyResource,
  body: unknown,
  id: string,
  options: LidOptions = {},
): Promise<ParsedResourceObject<unknown, RequestLinkage>> {
  return parseResourceObject(resource, primaryData(body), {
    ...options,
    operation: 'update',
    id,
  });
}

/** The `data` member of a request document, or a 400 when there is none. */
export function primaryData(body: unknown): unknown {
  if (!isRecord(body)) {
    throw jsonApiError(
      invalidDocument('', 'A JSON:API document must be a JSON object'),
    );
  }
  if (!hasOwnMember(body, 'data')) {
    throw jsonApiError(
      invalidDocument('', 'A request document must contain a data member'),
    );
  }
  return ownMember(body, 'data');
}
