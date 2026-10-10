/**
 * The error objects of a JSON:API error document (SPEC 7.2.1 to 7.2.4):
 * one for the error itself, or one per item of its list.
 * @ref https://jsonapi.org/format/#error-objects
 */
import type { BanError } from '../../core/ban-error';
import type { ErrorItem } from '../../core/error-item';
import type { ErrorStatusCode } from '../../core/status';
import type { IssueLocation } from '../../validation/issue';
import type { RenderContext } from '../context';
import type { JsonApiDocumentMembers } from './schema';

import { sanitizeMeta } from '../../internal/sanitize-meta';
import {
  isPointerLocation,
  nameFromPath,
  pointerFromPath,
} from '../../validation/issue';
import { readLocation } from '../error-entries';

export interface JsonApiLinks {
  readonly type?: string;
  readonly about?: string;
}

export interface JsonApiSource {
  readonly pointer?: string;
  readonly parameter?: string;
  readonly header?: string;
}

/**
 * A JSON:API 1.1 error object.
 * @ref https://jsonapi.org/format/#error-objects
 */
export interface JsonApiErrorObject {
  readonly id?: string;
  readonly links?: JsonApiLinks;
  /** The HTTP status as a string, as the specification requires. */
  readonly status: string;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly source?: JsonApiSource;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** `JsonApiOptions` with every default applied. */
export interface ResolvedJsonApiOptions {
  readonly typeLinkBaseUrl: string | undefined;
  readonly aboutLink:
    | ((error: BanError, ctx: RenderContext) => string | undefined)
    | undefined;
  readonly includeId: boolean;
  readonly traceIdMetaKey: string | false;
  readonly mixedEntries: boolean;
  readonly document: JsonApiDocumentMembers | undefined;
}

/** The members the schema pins per entry (7.2.3), plus the explicit type link. */
interface Identity {
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly title: string;
  readonly type: string | undefined;
}

function identityOf(error: BanError): Identity {
  return {
    status: error.status,
    code: error.code,
    title: error.title,
    type: error.type,
  };
}

/**
 * An item's identity (7.2.4). Under `mixedEntries` the item's own members
 * win and a derived type link follows the item's code; otherwise the error's
 * identity applies and only an explicit item `type` is honored, since the
 * schema never pins `links`.
 */
function itemIdentity(
  error: BanError,
  item: ErrorItem,
  options: ResolvedJsonApiOptions,
): Identity {
  if (!options.mixedEntries) {
    return { ...identityOf(error), type: item.type ?? error.type };
  }
  return {
    status: item.status ?? error.status,
    code: item.code ?? error.code,
    title: item.title ?? error.title,
    type: item.type ?? (item.code === undefined ? error.type : undefined),
  };
}

function links(
  error: BanError,
  ctx: RenderContext,
  options: ResolvedJsonApiOptions,
  identity: Identity,
): JsonApiLinks | undefined {
  const base = options.typeLinkBaseUrl ?? ctx.docsBaseUrl;
  const type =
    identity.type ??
    (base === undefined ? undefined : `${base}/${identity.code}`);
  const about = options.aboutLink?.(error, ctx);
  if (type === undefined && about === undefined) {
    return undefined;
  }
  return {
    ...(type === undefined ? {} : { type }),
    ...(about === undefined ? {} : { about }),
  };
}

function sharedMeta(
  ctx: RenderContext,
  options: ResolvedJsonApiOptions,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...ctx.meta };
  if (options.traceIdMetaKey !== false && ctx.traceId !== undefined) {
    meta[options.traceIdMetaKey] = ctx.traceId;
  }
  if (ctx.stack !== undefined) {
    meta['stack'] = ctx.stack;
  }
  return meta;
}

function errorObject(
  error: BanError,
  ctx: RenderContext,
  options: ResolvedJsonApiOptions,
  identity: Identity,
  detail: string | undefined,
  source: JsonApiSource | undefined,
  meta: Record<string, unknown>,
): JsonApiErrorObject {
  const linkMembers = links(error, ctx, options, identity);
  return {
    ...(options.includeId ? { id: error.id } : {}),
    ...(linkMembers === undefined ? {} : { links: linkMembers }),
    status: String(identity.status),
    code: identity.code,
    title: identity.title,
    ...(detail === undefined ? {} : { detail }),
    ...(source === undefined ? {} : { source }),
    ...(Object.keys(meta).length === 0 ? {} : { meta }),
  };
}

/**
 * `source.pointer` for bodies (and for items with a path but no location),
 * `source.parameter` for query parameters, `source.header` for headers.
 * JSON:API has no member for path or cookie parameters, so those are
 * described in `meta` instead.
 * @ref https://jsonapi.org/format/#error-objects
 */
function itemSource(
  path: ReadonlyArray<string | number> | undefined,
  location: IssueLocation | undefined,
): JsonApiSource | undefined {
  if (path === undefined) {
    return undefined;
  }
  if (location === undefined || isPointerLocation(location)) {
    return { pointer: pointerFromPath(path) };
  }
  if (location === 'query') {
    return { parameter: nameFromPath(path) };
  }
  if (location === 'header') {
    return { header: nameFromPath(path) };
  }
  return undefined;
}

/** Shared meta, then the item's own, then the members this format writes (7.2.2). */
function itemMeta(
  item: ErrorItem,
  location: IssueLocation | undefined,
  shared: Record<string, unknown>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    ...shared,
    ...(item.meta === undefined ? {} : sanitizeMeta(item.meta)),
  };
  if (location !== undefined) {
    meta['location'] = location;
  }
  if (
    (location === 'param' || location === 'cookie') &&
    item.path !== undefined
  ) {
    meta['name'] = nameFromPath(item.path);
  }
  if (item.reason !== undefined) {
    meta['code'] = item.reason;
  }
  if (item.expected !== undefined) {
    meta['expected'] = item.expected;
  }
  if (item.received !== undefined) {
    meta['received'] = item.received;
  }
  return meta;
}

/** The one object describing the error itself (7.2.1). */
export function errorAsObject(
  error: BanError,
  ctx: RenderContext,
  options: ResolvedJsonApiOptions,
): JsonApiErrorObject {
  return errorObject(
    error,
    ctx,
    options,
    identityOf(error),
    error.detail,
    undefined,
    sharedMeta(ctx, options),
  );
}

/** One object per item (7.2.2), each with its source and meta. */
export function itemsAsObjects(
  error: BanError,
  errors: ReadonlyArray<ErrorItem>,
  ctx: RenderContext,
  options: ResolvedJsonApiOptions,
): Array<JsonApiErrorObject> {
  const shared = sharedMeta(ctx, options);
  const fallback = readLocation(ctx.meta);
  return errors.map((item) => {
    const location = item.location ?? fallback;
    return errorObject(
      error,
      ctx,
      options,
      itemIdentity(error, item, options),
      item.detail,
      itemSource(item.path, location),
      itemMeta(item, location, shared),
    );
  });
}
