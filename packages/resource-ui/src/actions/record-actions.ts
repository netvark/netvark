/**
 * `recordActions(resource, options)` (resource SPEC 21.2): a record's
 * actions from the declaration, each one client call, `update` or `remove`
 * (jsonapi SPEC 15.4): the variables of the mutation that call names in
 * `resourceQueries` (jsonapi SPEC 16.2), whether the action shows and runs
 * for a record, and its refusal by member. The model imports no framework
 * and holds no state; the screen's mutations hold each request's.
 * @packageDocumentation
 */
import type { ActionCalls, GivenRemove } from './action-calls';
import type { HeldAction } from './action-init';
import type {
  ActionResource,
  RecordActions,
  RecordActionsOptions,
} from './action-types';

import { checkDeclared } from '../internal/declared';
import { isRecord } from '../internal/object';
import { recordErrors } from './action-errors';
import { RECORD_ACTIONS, readOptions } from './action-init';
import { recordState } from './action-state';

const CALLER = 'recordActions';

/** The id of `record`; a `TypeError` naming the action for a record whose `id` is not a string. */
function idOf(name: string, record: unknown): string {
  const id: unknown = isRecord(record) ? record['id'] : undefined;
  if (typeof id !== 'string') {
    throw new TypeError(
      `${CALLER}: ${name}.variables takes a record whose id is a string`,
    );
  }
  return id;
}

/** What `variables` gives: the record's id for a removal, `{ id, ...values }` for an update. */
function variablesOf(action: HeldAction): (record: unknown) => unknown {
  if (action.call === 'remove') {
    return (record) => idOf(action.name, record);
  }
  const { values } = action;
  return (record) =>
    Object.freeze({ id: idOf(action.name, record), ...values });
}

/**
 * A record's actions on `resource`, by name in the order of
 * `options.actions`, each typed by the call it makes. Throws `TypeError`
 * before it returns for a resource no `declareResource` returned and for
 * each argument SPEC 21.4 refuses.
 */
export function recordActions<
  TResource extends ActionResource,
  TRemove extends GivenRemove,
>(
  resource: TResource,
  options: RecordActionsOptions<TResource, TRemove>,
): RecordActions<TResource, ActionCalls<TRemove>> {
  checkDeclared(CALLER, resource);
  const { actions, can } = readOptions(RECORD_ACTIONS, resource, options);
  const model = Object.fromEntries(
    actions.map((action) => [
      action.name,
      Object.freeze({
        name: action.name,
        call: action.call,
        tone: action.tone,
        label: action.label,
        confirm: action.confirm,
        done: action.done,
        state: (record: unknown) => recordState(action, can, record),
        variables: variablesOf(action),
        errors: (error: unknown) => recordErrors(resource.fields, error),
      }),
    ]),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: readOptions held each action to the declaration, which RecordActions types by the same operations and update input, gave each the call its remove names, and each member holds the application's function as given
  return Object.freeze(model) as unknown as RecordActions<
    TResource,
    ActionCalls<TRemove>
  >;
}
