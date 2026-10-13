/**
 * Reading the actions the application describes (resource SPEC 21.2, 21.3,
 * 21.4): the options, each action's write, which the declaration must serve,
 * and its texts, each a function the model holds as given and calls only
 * when the screen asks, so a text renders in the locale of that render (ADR
 * 0014). An update's values are held to the declaration by
 * `action-values.ts`. Each `TypeError` names the function, the action, and
 * the member, never a value.
 * @packageDocumentation
 */
import type { ActionResource, ActionTone } from './action-types';
import type { HeldValues } from './action-values';

import { isRecord } from '../internal/object';
import { heldValues } from './action-values';

/** A function of the application's, held as given and called with what its slot takes. */
export type HeldFunction = (input?: unknown) => unknown;

/** A confirmation as the models hold it: `null` for each function the application gave none of. */
interface HeldConfirm {
  readonly title: HeldFunction;
  readonly body: HeldFunction | null;
  readonly confirm: HeldFunction | null;
}

/** An action as the models hold it: its write and the application's functions. */
export type HeldAction = {
  readonly name: string;
  readonly tone: ActionTone;
  readonly label: HeldFunction;
  readonly confirm: HeldConfirm | null;
  readonly done: HeldFunction | null;
  readonly hidden: HeldFunction | null;
  readonly disabled: HeldFunction | null;
} & (
  | { readonly call: 'remove' }
  | { readonly call: 'update'; readonly values: HeldValues }
);

/** What each function takes: its name, its options, and the members of its actions. */
export interface ActionsKind {
  readonly caller: string;
  readonly what: string;
  readonly options: ReadonlySet<string>;
  readonly members: ReadonlySet<string>;
}

const TEXTS = ['label', 'tone', 'confirm', 'done', 'disabled'];

export const RECORD_ACTIONS: ActionsKind = {
  caller: 'recordActions',
  what: 'a record action',
  options: new Set(['actions', 'can']),
  members: new Set(['remove', 'update', ...TEXTS, 'hidden']),
};

export const BULK_ACTIONS: ActionsKind = {
  caller: 'bulkActions',
  what: 'a bulk action',
  options: new Set(['actions', 'can', 'tooMany']),
  members: new Set(['remove', 'update', ...TEXTS]),
};

const CONFIRM_MEMBERS: ReadonlySet<string> = new Set([
  'title',
  'body',
  'confirm',
]);

function isFunction(value: unknown): value is HeldFunction {
  return typeof value === 'function';
}

function isTone(value: unknown): value is ActionTone {
  return value === 'neutral' || value === 'danger';
}

/** `value` when it is a function; a `TypeError` naming `at` otherwise. */
export function functionAt(
  caller: string,
  at: string,
  value: unknown,
): HeldFunction {
  if (!isFunction(value)) {
    throw new TypeError(`${caller}: ${at} must be a function`);
  }
  return value;
}

/** As `functionAt`, and `null` for a member left out. */
function optionalAt(
  caller: string,
  at: string,
  value: unknown,
): HeldFunction | null {
  return value === undefined ? null : functionAt(caller, at, value);
}

/** Throws for a key of `value` that `known` does not hold, naming it under `at`. */
function checkKeys(
  caller: string,
  at: string,
  value: Readonly<Record<string, unknown>>,
  known: ReadonlySet<string>,
  what: string,
): void {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      throw new TypeError(`${caller}: ${at}.${key} is not ${what}`);
    }
  }
}

function confirmOf(
  caller: string,
  at: string,
  confirm: unknown,
): HeldConfirm | null {
  if (confirm === undefined) {
    return null;
  }
  if (!isRecord(confirm)) {
    throw new TypeError(`${caller}: ${at} must be an object`);
  }
  checkKeys(caller, at, confirm, CONFIRM_MEMBERS, 'a member of a confirmation');
  const { title, body, confirm: button } = confirm;
  return Object.freeze({
    title: functionAt(caller, `${at}.title`, title),
    body: optionalAt(caller, `${at}.body`, body),
    confirm: optionalAt(caller, `${at}.confirm`, button),
  });
}

function toneOf(caller: string, at: string, tone: unknown): ActionTone {
  if (tone === undefined) {
    return 'neutral';
  }
  if (!isTone(tone)) {
    throw new TypeError(`${caller}: ${at} must be neutral or danger`);
  }
  return tone;
}

/** Throws unless `resource` serves `operation`, which the action at `at` makes. */
function checkServed(
  caller: string,
  resource: ActionResource,
  at: string,
  operation: 'remove' | 'update',
): void {
  if (!resource.declaration.operations.includes(operation)) {
    throw new TypeError(
      `${caller}: ${at} ${operation}s, which ${resource.names.type} does not serve`,
    );
  }
}

/** The write of the action at `at`: exactly one of `remove: true` and `update`, the declaration serving it. */
function writeOf(
  caller: string,
  resource: ActionResource,
  at: string,
  { remove, update }: Readonly<Record<string, unknown>>,
):
  | { readonly call: 'remove' }
  | { readonly call: 'update'; readonly values: HeldValues } {
  if (remove !== undefined && update !== undefined) {
    throw new TypeError(`${caller}: ${at} gives both remove and update`);
  }
  if (remove !== undefined) {
    if (remove !== true) {
      throw new TypeError(`${caller}: ${at}.remove must be true`);
    }
    checkServed(caller, resource, at, 'remove');
    return { call: 'remove' };
  }
  if (update === undefined) {
    throw new TypeError(`${caller}: ${at} gives neither remove nor update`);
  }
  checkServed(caller, resource, at, 'update');
  return {
    call: 'update',
    values: heldValues({ caller, at: `${at}.update` }, resource, update),
  };
}

function actionOf(
  kind: ActionsKind,
  resource: ActionResource,
  name: string,
  init: unknown,
): HeldAction {
  const { caller } = kind;
  const at = `options.actions.${name}`;
  if (!isRecord(init)) {
    throw new TypeError(`${caller}: ${at} must be an object`);
  }
  checkKeys(caller, at, init, kind.members, `a member of ${kind.what}`);
  const { label, tone, confirm, done, hidden, disabled } = init;
  return Object.freeze({
    name,
    ...writeOf(caller, resource, at, init),
    tone: toneOf(caller, `${at}.tone`, tone),
    label: functionAt(caller, `${at}.label`, label),
    confirm: confirmOf(caller, `${at}.confirm`, confirm),
    done: optionalAt(caller, `${at}.done`, done),
    hidden: optionalAt(caller, `${at}.hidden`, hidden),
    disabled: optionalAt(caller, `${at}.disabled`, disabled),
  });
}

/** What both functions' options hold, read. */
export interface HeldOptions {
  /** In the order of `options.actions`. */
  readonly actions: ReadonlyArray<HeldAction>;
  readonly can: HeldFunction | null;
}

/**
 * The options a JavaScript caller passed `kind`'s function, each action
 * held to `resource`; `bulkActions` reads its `tooMany` itself. Throws for
 * options that are not an object or hold an unknown key, for `actions`
 * that is not an object, for each action SPEC 21.4 refuses, and for a
 * `can` that is not a function.
 */
export function readOptions(
  kind: ActionsKind,
  resource: ActionResource,
  options: unknown,
): HeldOptions {
  const { caller } = kind;
  if (!isRecord(options)) {
    throw new TypeError(`${caller}: options must be an object`);
  }
  checkKeys(caller, 'options', options, kind.options, 'an option');
  const { actions, can } = options;
  if (!isRecord(actions)) {
    throw new TypeError(
      `${caller}: options.actions must be an object of actions`,
    );
  }
  return {
    can: optionalAt(caller, 'options.can', can),
    actions: Object.entries(actions).map(([name, init]) =>
      actionOf(kind, resource, name, init),
    ),
  };
}
