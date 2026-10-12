/**
 * What the Atomic Operations tests build their documents of, over the
 * registry of `atomic-registry.ts`: a team's and a person's ids, a team's
 * resource object, an `add` of a team, and an operations document. Not
 * published with the package.
 * @packageDocumentation
 */
export const TEAM = '00000000-0000-4000-8000-0000000000aa';
export const PERSON = '00000000-0000-4000-8000-0000000000bb';

/** A team's resource object, its attributes `attributes` over valid ones. */
export function team(
  attributes: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    type: 'teams',
    attributes: { name: 'Core', slug: 'core', ...attributes },
  };
}

/** An `add` of a team, under `lid` when given. */
export function addTeam(lid?: string): Record<string, unknown> {
  return {
    op: 'add',
    data: { ...team(), ...(lid === undefined ? {} : { lid }) },
  };
}

/** The operations document of `operations`. */
export function ops(
  ...operations: ReadonlyArray<unknown>
): Record<string, unknown> {
  return { 'atomic:operations': operations };
}
