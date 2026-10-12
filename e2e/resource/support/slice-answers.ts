/**
 * What the contacts slice's tests read of an answer: a resource
 * document's id and attributes, the ids of a page and its next and
 * previous links, and each error object's status, code, pointer or
 * parameter, title, and detail.
 */
import type { Sent } from './http.ts';

interface ErrorObject {
  readonly status?: string;
  readonly code?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly source?: { readonly pointer?: string; readonly parameter?: string };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The member of `node` at `path`, or `undefined`. */
function memberAt(node: unknown, path: ReadonlyArray<string>): unknown {
  let at = node;
  for (const key of path) {
    at = isRecord(at) && Object.hasOwn(at, key) ? at[key] : undefined;
  }
  return at;
}

/** The primary resource's id. */
export function idOf(sent: Sent): string {
  return String(memberAt(sent.body, ['data', 'id']));
}

/** The primary resource's attributes. */
export function attributesOf(sent: Sent): Readonly<Record<string, unknown>> {
  const attributes = memberAt(sent.body, ['data', 'attributes']);
  return isRecord(attributes) ? attributes : {};
}

/** The ids of a page, in order. */
export function pageIds(sent: Sent): Array<string> {
  const data = memberAt(sent.body, ['data']);
  return Array.isArray(data)
    ? data.map((item: unknown) => String(memberAt(item, ['id'])))
    : [];
}

/** A page's link `name`, as a path and query, or `undefined`. */
export function linkOf(sent: Sent, name: 'next' | 'prev'): string | undefined {
  const link = memberAt(sent.body, ['links', name]);
  return typeof link === 'string' ? link : undefined;
}

/** The status, then each error object's status, code, pointer or parameter, title, and detail. */
export function problemsOf(sent: Sent): ReadonlyArray<unknown> {
  const errors = memberAt(sent.body, ['errors']);
  const objects: ReadonlyArray<ErrorObject> = Array.isArray(errors)
    ? errors.filter((error: unknown): error is ErrorObject => isRecord(error))
    : [];
  return [
    sent.status,
    ...objects.map((error) => [
      error.status,
      error.code,
      error.source?.pointer ?? error.source?.parameter,
      error.title,
      error.detail,
    ]),
  ];
}
