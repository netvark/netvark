/**
 * `state(target)` (resource SPEC 21.2, 21.3): whether an action shows,
 * whether it runs, and why it does not. Only `can(name) === true` shows an
 * action, and a record action's `hidden(record) === true` hides it; a hidden
 * action is disabled too, so a screen that shows it anyway cannot run it.
 * `disabled(target)` disables it with `true`, or with a string, the reason a
 * tooltip shows. A selection one request cannot write, one that is not a
 * list of ids, is empty, or names an id twice, disables a bulk action
 * without a reason, and one over the cap with `tooMany`'s. The application's
 * functions run at every call, so a reason renders in the locale of that
 * render (ADR 0014).
 * @packageDocumentation
 */
import type { HeldAction, HeldFunction } from './action-init';
import type { ActionState } from './action-types';

const HIDDEN: ActionState = Object.freeze({
  visible: false,
  disabled: true,
  reason: null,
});

const ENABLED: ActionState = Object.freeze({
  visible: true,
  disabled: false,
  reason: null,
});

const DISABLED: ActionState = Object.freeze({
  visible: true,
  disabled: true,
  reason: null,
});

/** A shown action disabled for `reason` when it is a text, without a reason otherwise. */
function disabledFor(reason: unknown): ActionState {
  return typeof reason === 'string'
    ? Object.freeze({ visible: true, disabled: true, reason })
    : DISABLED;
}

/** What `disabled`'s answer makes of a shown action: `true` and a text disable it, anything else enables it. */
function answered(answer: unknown): ActionState {
  return answer === true || typeof answer === 'string'
    ? disabledFor(answer)
    : ENABLED;
}

/** Whether `can` lets the person run the action `name`; without `can`, every action runs (SPEC 12.2). */
function allowed(can: HeldFunction | null, name: string): boolean {
  return can === null || can(name) === true;
}

/** A record action's state for `record`. */
export function recordState(
  action: HeldAction,
  can: HeldFunction | null,
  record: unknown,
): ActionState {
  if (!allowed(can, action.name) || action.hidden?.(record) === true) {
    return HIDDEN;
  }
  return answered(action.disabled?.(record));
}

/** What keeps a list from being a selection one request writes. */
export type SelectionFault = 'list' | 'empty' | 'twice' | 'tooMany';

/** What keeps `ids` from being a selection of at most `max` records, each named once; `undefined` when nothing does. */
export function selectionFault(
  ids: unknown,
  max: number,
): SelectionFault | undefined {
  if (
    !Array.isArray(ids) ||
    !ids.every((id: unknown) => typeof id === 'string')
  ) {
    return 'list';
  }
  if (ids.length === 0) {
    return 'empty';
  }
  if (new Set(ids).size !== ids.length) {
    return 'twice';
  }
  return ids.length > max ? 'tooMany' : undefined;
}

/** What a bulk action's state reads besides the action: `can`, the cap, and its reason. */
export interface BulkStateOf {
  readonly can: HeldFunction | null;
  readonly max: number;
  readonly tooMany: HeldFunction;
}

/** A bulk action's state for the selection `ids`. */
export function bulkState(
  action: HeldAction,
  of: BulkStateOf,
  ids: unknown,
): ActionState {
  if (!allowed(of.can, action.name)) {
    return HIDDEN;
  }
  const fault = selectionFault(ids, of.max);
  if (fault === 'tooMany') {
    return disabledFor(of.tooMany({ max: of.max }));
  }
  return fault === undefined ? answered(action.disabled?.(ids)) : DISABLED;
}
