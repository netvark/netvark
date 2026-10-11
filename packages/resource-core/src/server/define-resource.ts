/**
 * `defineResource` at runtime (SPEC 12.3): every check the types make,
 * made again for JavaScript callers, each a `TypeError` naming the
 * resource and the option. The behavior comes back normalized and frozen:
 * `denyAll` when there is no policy, and empty `rules` and `effects` when
 * an operation gives none, so a runtime reads one shape.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { ResourceBehavior } from './behavior-types';

import { internalsOf } from '../declare/declared-resource';
import { isRecord } from '../internal/object';
import { denyAll, isPolicyFor } from './policy';
import { serverValueColumns } from './server-values';

/** The members each writing operation takes. */
const MEMBERS = {
  create: ['values', 'quota', 'rules', 'effects'],
  update: ['rules', 'effects'],
  remove: ['rules', 'effects'],
} as const;

type Writing = keyof typeof MEMBERS;

function isWriting(operation: string): operation is Writing {
  return Object.hasOwn(MEMBERS, operation);
}

type AnyFunction = (...args: ReadonlyArray<never>) => unknown;

function isFunctionList(value: unknown): value is ReadonlyArray<AnyFunction> {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'function')
  );
}

function functions(where: string, value: unknown): ReadonlyArray<AnyFunction> {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!isFunctionList(value)) {
    throw new TypeError(`${where} must be an array of functions`);
  }
  return Object.freeze([...value]);
}

function checkMembers(where: string, operation: Writing, init: unknown) {
  if (!isRecord(init)) {
    throw new TypeError(`${where} must be an object`);
  }
  const allowed: ReadonlyArray<string> = MEMBERS[operation];
  for (const key of Object.keys(init)) {
    if (!allowed.includes(key)) {
      throw new TypeError(
        `${where}: "${key}" is not one of ${allowed.join(', ')}`,
      );
    }
  }
  return init;
}

function createBehavior(
  where: string,
  init: unknown,
  columns: ReadonlyArray<string>,
) {
  const create = checkMembers(where, 'create', init);
  const { values, quota } = create;
  if (columns.length > 0 && typeof values !== 'function') {
    throw new TypeError(`${where}.values must supply ${columns.join(', ')}`);
  }
  if (columns.length === 0 && values !== undefined) {
    throw new TypeError(
      `${where}.values must be absent: the resource has no server values`,
    );
  }
  if (quota !== undefined && (typeof quota !== 'string' || quota === '')) {
    throw new TypeError(`${where}.quota must be a quota's name`);
  }
  return Object.freeze({
    values,
    quota,
    rules: functions(`${where}.rules`, create['rules']),
    effects: functions(`${where}.effects`, create['effects']),
  });
}

function operationBehaviors(
  type: string,
  declared: DeclaredResource,
  init: unknown,
  columns: ReadonlyArray<string>,
) {
  const where = `defineResource: ${type}: operations`;
  if (init !== undefined && !isRecord(init)) {
    throw new TypeError(`${where} must be an object`);
  }
  const operations = init ?? {};
  for (const operation of Object.keys(operations)) {
    if (!isWriting(operation)) {
      throw new TypeError(
        `${where}: "${operation}" has no behavior; operations takes create, update, and remove`,
      );
    }
    if (!declared.declaration.operations.includes(operation)) {
      throw new TypeError(`${where}: ${operation} is not a declared operation`);
    }
  }
  if (columns.length > 0 && operations['create'] === undefined) {
    throw new TypeError(
      `${where}.create.values must supply ${columns.join(', ')}`,
    );
  }
  const behaviors: Record<string, unknown> = {};
  for (const [operation, value] of Object.entries(operations)) {
    if (operation === 'create') {
      behaviors[operation] = createBehavior(`${where}.create`, value, columns);
    } else if (isWriting(operation)) {
      const member = checkMembers(`${where}.${operation}`, operation, value);
      behaviors[operation] = Object.freeze({
        rules: functions(`${where}.${operation}.rules`, member['rules']),
        effects: functions(`${where}.${operation}.effects`, member['effects']),
      });
    }
  }
  return Object.freeze(behaviors);
}

/** Checks what JavaScript passes to `defineResource` and returns the behavior. */
export function defineResourceIn(
  resource: unknown,
  init: unknown,
): ResourceBehavior {
  const internals = internalsOf(resource);
  if (internals === undefined) {
    throw new TypeError(
      'defineResource: the resource must be a resource declareResource returned',
    );
  }
  const declared = internals.resource;
  const { type } = declared.names;
  if (!isRecord(init)) {
    throw new TypeError(
      `defineResource: ${type}: the behavior must be an object`,
    );
  }
  const policy = init['policy'] ?? denyAll;
  if (!isPolicyFor(policy, declared)) {
    throw new TypeError(
      `defineResource: ${type}: policy must come from definePolicy(${type}, ...) or be denyAll`,
    );
  }
  const columns = serverValueColumns(internals);
  const behavior = Object.freeze({
    resource: declared,
    policy,
    operations: operationBehaviors(type, declared, init['operations'], columns),
    serverValues: Object.freeze([...columns]),
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: each member was checked above against the shapes ResourceBehavior declares; behavior.test.ts covers every refusal
  return behavior as unknown as ResourceBehavior;
}
