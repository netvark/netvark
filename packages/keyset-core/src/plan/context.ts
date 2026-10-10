/**
 * The caller's cursor context (SPEC 6.1, ADR 0015): values from outside
 * the request, such as the tenant a query is scoped to, that cursors are
 * bound to besides the sort, filter, and search. The server supplies them,
 * so a context that cannot be bound unambiguously is a programming error:
 * a `TypeError` naming the member, raised before the request is read.
 * @packageDocumentation
 */
import { PROTO_KEYS } from '../internal/object';

/**
 * A value cursors can be bound to. A bigint binds as its decimal text, the
 * way canonical JSON writes it (SPEC 2.4), so `1n` and `'1'` bind alike.
 */
export type CursorContextValue = string | number | bigint | boolean | null;

/** Named values cursors are bound to, such as `{ tenant: org.id }`. */
export type CursorContext = Readonly<Record<string, CursorContextValue>>;

/** What `plan` takes from the server, never from the client. */
export interface PlanOptions {
  /**
   * Values this request's cursors are bound to besides its sort, filter,
   * and search: a cursor issued under one context is rejected under any
   * other with reason `context`. An empty or absent context binds nothing.
   */
  readonly context?: CursorContext | undefined;
}

function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The `typeof` of the values a context binds as they are; numbers need a check. */
const BOUND_TYPES: ReadonlySet<string> = new Set([
  'string',
  'bigint',
  'boolean',
]);

function isContextValue(value: unknown): value is CursorContextValue {
  if (typeof value === 'number') {
    // JSON writes NaN and the infinities as null, so they would bind as it.
    return Number.isFinite(value);
  }
  return value === null || BOUND_TYPES.has(typeof value);
}

/**
 * The context as it joins the cursor binding: a copy of its members, or
 * `undefined` when it has none, so a request without a context keeps the
 * binding it had before contexts existed.
 */
export function bindingContext(context: unknown): CursorContext | undefined {
  if (context === undefined) {
    return undefined;
  }
  // A Date, a Map, or a class instance has no own enumerable members and
  // would silently bind nothing.
  if (!isPlainObject(context)) {
    throw new TypeError('context must be a plain object');
  }
  const members: Array<[string, CursorContextValue]> = [];
  for (const name of Object.keys(context)) {
    const value = context[name];
    if (PROTO_KEYS.has(name)) {
      throw new TypeError(`context.${name} is a reserved name`);
    }
    if (!isContextValue(value)) {
      throw new TypeError(
        `context.${name} must be a string, a finite number, a bigint, a boolean, or null`,
      );
    }
    members.push([name, value]);
  }
  return members.length === 0 ? undefined : Object.fromEntries(members);
}
