/**
 * `next` and `prev` (SPEC 15.8): the page a page's `links.next` or
 * `links.prev` names. The link is followed as the server wrote it, its
 * query untouched, since rewriting a URL's `searchParams` re-serializes
 * every pair; its records resolve along the `include` it carries. A link
 * is followed only when it is absolute or root-relative and on the
 * transport's origin (ADR 0017).
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-links
 * @ref https://jsonapi.org/format/1.1/#fetching-pagination
 * @packageDocumentation
 */
import type { CallOptions, Outgoing } from '../transport/send';
import type { ReadResult } from './types';
import type { CallContext } from './urls';

import { linkOf } from '../document/members';
import { isRecord, ownMember } from '../internal/object';
import { atOrigin } from '../transport/origin';
import { send } from '../transport/send';
import { recordsResult } from './results';

/** The include paths a followed link carries, which its records resolve along. */
function includeOf(url: URL): ReadonlyArray<string> {
  const include = url.searchParams.get('include');
  return include === null || include === '' ? [] : include.split(',');
}

/**
 * The page `result.links[call]` names, `undefined` when that link is
 * `null` or absent. Throws `TypeError` for a link to another origin.
 */
export async function follow(
  context: CallContext,
  call: 'next' | 'prev',
  result: { readonly links?: unknown },
  options: CallOptions | undefined,
): Promise<ReadResult<unknown> | undefined> {
  const { type } = context.definition;
  const link = isRecord(result.links)
    ? linkOf(ownMember(result.links, call))
    : undefined;
  if (link === undefined || link === null) {
    return undefined;
  }
  const url = atOrigin(
    context.state.origin,
    typeof link === 'string' ? link : link.href,
  );
  if (url === undefined) {
    throw new TypeError(
      `${type} ${call}: links.${call} must be absolute or start with "/", and be on the transport's origin`,
    );
  }
  const outgoing: Outgoing = { type, call, method: 'GET', url: url.href };
  return recordsResult(
    await send(context.state, outgoing, options),
    outgoing,
    includeOf(url),
    'list',
  );
}
