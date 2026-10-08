/**
 * The members of a request resource object (SPEC 9.2): identity (`type`,
 * `id`, `lid`), attribute names, and relationships. Each parser pushes
 * error objects with pointers and returns what it understood, so one 400
 * reports every problem.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/format/1.1/#crud-updating-resource-relationships
 * @packageDocumentation
 */
import type { ErrorObject } from '../document/types';
import type { AnyResource } from '../resource/types';
import type { RequestLinkage } from './identifiers';
import type { ParseResourceOptions } from './types';

import { isAtMember } from '../document/member-name';
import { errorObject } from '../errors/json-api-error';
import {
  hasOwnMember,
  isRecord,
  ownEntry,
  ownMember,
} from '../internal/object';
import { pointer as toPointer } from '../internal/pointer';
import { conflict, invalidDocument, parseLinkage } from './identifiers';

export const RESOURCE_MEMBERS: ReadonlySet<string> = new Set([
  'type',
  'id',
  'lid',
  'attributes',
  'relationships',
  'links',
  'meta',
]);

interface Identity {
  readonly id: string | undefined;
  readonly lid: string | undefined;
}

/** `type` must equal the definition's; `id` and `lid` follow the operation. */
export function parseIdentity(
  resource: AnyResource,
  data: Record<string, unknown>,
  options: ParseResourceOptions,
  pointer: string,
  errors: Array<ErrorObject>,
): Identity {
  const type = ownMember(data, 'type');
  if (typeof type !== 'string') {
    errors.push(
      invalidDocument(
        `${pointer}/type`,
        'A resource object must have a string type',
      ),
    );
  } else if (type !== resource.type) {
    errors.push(
      conflict(
        `${pointer}/type`,
        `This endpoint accepts resources of type "${resource.type}", received "${type}"`,
      ),
    );
  }
  const id = ownMember(data, 'id');
  const lid = ownMember(data, 'lid');
  if (hasOwnMember(data, 'id') && typeof id !== 'string') {
    errors.push(invalidDocument(`${pointer}/id`, 'id must be a string'));
  }
  if (
    hasOwnMember(data, 'lid') &&
    (typeof lid !== 'string' || options.lids !== true)
  ) {
    errors.push(
      invalidDocument(
        `${pointer}/lid`,
        options.lids === true
          ? 'lid must be a string'
          : 'lid is not accepted here',
      ),
    );
  }
  if (options.operation === 'create') {
    if (typeof id === 'string' && !resource.clientIds) {
      errors.push(
        errorObject('CLIENT_GENERATED_ID_NOT_SUPPORTED', {
          detail: `"${resource.type}" does not accept client-generated ids`,
          source: { pointer: `${pointer}/id` },
        }),
      );
    }
  } else if (typeof id === 'string') {
    if (options.id !== undefined && id !== options.id) {
      errors.push(
        conflict(
          `${pointer}/id`,
          `The document's id "${id}" does not match the request's id "${options.id}"`,
        ),
      );
    }
  } else if (!(options.lids === true && typeof lid === 'string')) {
    errors.push(
      invalidDocument(
        `${pointer}/id`,
        'An update must identify the resource with a string id',
      ),
    );
  }
  return {
    id: typeof id === 'string' ? id : undefined,
    lid: typeof lid === 'string' ? lid : undefined,
  };
}

export function parseRelationships(
  resource: AnyResource,
  value: unknown,
  options: ParseResourceOptions,
  pointer: string,
  errors: Array<ErrorObject>,
): Record<string, RequestLinkage> {
  const out: Record<string, RequestLinkage> = {};
  if (value === undefined) {
    return out;
  }
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'relationships must be an object'));
    return out;
  }
  for (const [name, relationship] of Object.entries(value)) {
    const definition = ownEntry(resource.relationships, name);
    const at = `${pointer}/${toPointer([name]).slice(1)}`;
    if (isAtMember(name)) {
      continue;
    }
    if (definition === undefined) {
      errors.push(
        invalidDocument(at, `"${resource.type}" has no relationship "${name}"`),
      );
      continue;
    }
    if (!isRecord(relationship) || !hasOwnMember(relationship, 'data')) {
      errors.push(
        invalidDocument(
          at,
          'A relationship in a request must be a relationship object with a data member',
        ),
      );
      continue;
    }
    const linkage = parseLinkage(
      ownMember(relationship, 'data'),
      `${at}/data`,
      definition.cardinality,
      { lids: options.lids, type: definition.type },
      errors,
    );
    if (linkage !== undefined) {
      out[name] = linkage;
    }
  }
  return out;
}

/** Attribute names must be declared; values are checked by the validator. */
export function parseAttributeNames(
  resource: AnyResource,
  value: unknown,
  pointer: string,
  errors: Array<ErrorObject>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value === undefined) {
    return out;
  }
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'attributes must be an object'));
    return out;
  }
  for (const [name, attribute] of Object.entries(value)) {
    if (isAtMember(name)) {
      continue;
    }
    if (!resource.attributes.includes(name)) {
      errors.push(
        invalidDocument(
          `${pointer}/${toPointer([name]).slice(1)}`,
          `"${resource.type}" has no attribute "${name}"`,
        ),
      );
      continue;
    }
    out[name] = attribute;
  }
  return out;
}
