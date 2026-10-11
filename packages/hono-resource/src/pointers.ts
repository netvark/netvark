/**
 * Moving a refusal's items to where the request held the input (resource
 * SPEC 19.3, 19.4). The runtime points an item into the resource object
 * at `/data` (SPEC 12.10). A relationship document holds the linkage at
 * `/data` itself, so an item at the relationship, or under its linkage,
 * moves there, and an item at another member, which the document does not
 * hold, loses its pointer rather than point at nothing.
 * @ref https://jsonapi.org/format/1.1/#error-objects ("pointer: a JSON Pointer [RFC6901] to the value in the request document that caused the error")
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 * @packageDocumentation
 */
import type { ErrorItem } from '@netvark/hono-jsonapi';

import { BanError, isBanError } from '@netvark/hono-jsonapi';

/** An item's path: RFC 6901 reference tokens. */
type Path = NonNullable<ErrorItem['path']>;

const DATA = 'data';
const RELATIONSHIPS = 'relationships';

/**
 * Where `path` goes when the input of relationship `name` sits at `base`:
 * the relationship itself at `base`, its linkage under it, and any other
 * member nowhere.
 */
export function linkagePath(
  path: Path,
  name: string,
  base: Path,
): Path | undefined {
  const [data, group, member, linkage, ...rest] = path;
  if (data !== DATA || group !== RELATIONSHIPS || member !== name) {
    return undefined;
  }
  if (linkage === undefined) {
    return base;
  }
  return linkage === DATA ? [...base, ...rest] : undefined;
}

/** Where a path into the body goes, or nowhere. */
type Move = (path: Path) => Path | undefined;

/** `item` moved by `move` when it points into the body, or without its pointer. */
function movedItem(item: ErrorItem, move: Move): ErrorItem {
  const { path, ...rest } = item;
  if (
    path === undefined ||
    (item.location !== undefined && item.location !== 'body')
  ) {
    return item;
  }
  const moved = move(path);
  return moved === undefined ? rest : { ...rest, path: moved };
}

/**
 * `error` with each item that points into the body moved by `move`, and
 * without its pointer where `move` gives no path. Anything but a
 * `BanError` with items is returned as it is.
 */
export function moveItems(error: unknown, move: Move): unknown {
  if (!isBanError(error) || error.errors === undefined) {
    return error;
  }
  const errors = error.errors.map((item) => movedItem(item, move));
  return new BanError({ ...error.toInit(), errors });
}
