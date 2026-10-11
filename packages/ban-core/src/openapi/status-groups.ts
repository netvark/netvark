/**
 * The statuses an OpenAPI operation's error responses are keyed by (SPEC 9):
 * the entries of each status, and for a format that combines entries in one
 * body (7.2.4), the entries a body sent with each status may carry.
 * @packageDocumentation
 */
import type { ResolvedDefinition } from '../core/definition';

/** The statuses `responseStatus` sends a body of several statuses with (SPEC 7.2.4). */
const BAD_REQUEST = 400;
const INTERNAL_SERVER_ERROR = 500;

/** The definitions of each status, in the order given. */
export function byStatus(
  definitions: ReadonlyArray<ResolvedDefinition>,
): Map<number, Array<ResolvedDefinition>> {
  const groups = new Map<number, Array<ResolvedDefinition>>();
  for (const definition of definitions) {
    const group = groups.get(definition.status) ?? [];
    group.push(definition);
    groups.set(definition.status, group);
  }
  return groups;
}

/**
 * The definitions a body of each status may carry when one body combines
 * entries. Such a body is sent with `responseStatus` of its objects (SPEC
 * 7.2.4): the status they share, else 400 when every one is a client error,
 * else 500. So each status carries its own entries; 400 also every 4xx
 * entry once the 4xx entries span two statuses; 500 every entry once the
 * entries span two statuses and one of them is 5xx.
 * @ref https://jsonapi.org/format/1.1/#errors-processing
 */
export function mixedGroups(
  definitions: ReadonlyArray<ResolvedDefinition>,
): Map<number, ReadonlyArray<ResolvedDefinition>> {
  const groups: Map<number, ReadonlyArray<ResolvedDefinition>> = byStatus(
    definitions,
  );
  const clientErrors = definitions.filter(
    (definition) => definition.status < INTERNAL_SERVER_ERROR,
  );
  if (new Set(clientErrors.map((definition) => definition.status)).size > 1) {
    groups.set(BAD_REQUEST, clientErrors);
  }
  const statuses = [...groups.keys()];
  if (
    statuses.length > 1 &&
    statuses.some((status) => status >= INTERNAL_SERVER_ERROR)
  ) {
    groups.set(INTERNAL_SERVER_ERROR, definitions);
  }
  return groups;
}

/** Each distinct description once, in the order given: entries may share one. */
export function describe(
  definitions: ReadonlyArray<ResolvedDefinition>,
): string {
  return [
    ...new Set(definitions.map((definition) => definition.description)),
  ].join(' or ');
}
