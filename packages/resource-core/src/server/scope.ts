/**
 * `defineScope({ column, value, session })` (SPEC 12.5): how a scope of the
 * definer binds to the actor and to the database session. `value` reads
 * the actor's tenant; `session` names the custom configuration parameter
 * row security policies read with `current_setting`, which the adapter
 * sets for the transaction only (`set_config(session, value, true)`), next
 * to the scope predicate it adds to every statement and the value it
 * writes into the column on create (SPEC 12.8). `ScopeBindings` holds a
 * binding per scope of the definer, each over the same column, and
 * `scopeValues` reads an actor's values for `StorageAdapter.transaction`.
 * @ref https://www.postgresql.org/docs/18/runtime-config-custom.html
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET
 * @packageDocumentation
 */
import type { ScopeRegistry } from '../declare/registries';

import { isRecord } from '../internal/object';

/** A tenant id as the session parameter and the scope column take it. */
export type ScopeKey = string | number;

/** A scope's binding: its column, the actor's value, and the session parameter. */
export interface Scope<TColumn extends string = string, TActor = never> {
  readonly column: TColumn;
  readonly value: (actor: TActor) => ScopeKey;
  /** A custom parameter: two dotted identifiers, such as `app.organization_id`. */
  readonly session: string;
}

/** A binding per scope of the definer's `scopes`, each over that scope's column: `satisfies ScopeBindings<typeof SCOPES>`. */
export type ScopeBindings<TScopes extends ScopeRegistry, TActor = never> = {
  readonly [K in keyof TScopes]: Scope<TScopes[K]['column'], TActor>;
};

/** One scope as a transaction applies it (SPEC 12.8). */
export interface ScopeValue {
  /** The scope's name in the definer's `scopes`, which a declaration's `scope` names. */
  readonly scope: string;
  readonly column: string;
  readonly session: string;
  readonly value: ScopeKey;
}

/** What PostgreSQL accepts as a custom parameter name without quoting. */
const SESSION = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/u;

/** A scope's binding, frozen; throws `TypeError` for a binding JavaScript got wrong. */
export function defineScope<const TColumn extends string, TActor>(
  scope: Scope<TColumn, TActor>,
): Scope<TColumn, TActor> {
  const value: unknown = scope;
  if (
    !isRecord(value) ||
    typeof value['column'] !== 'string' ||
    value['column'] === ''
  ) {
    throw new TypeError('defineScope: column must be a column name');
  }
  if (typeof value['value'] !== 'function') {
    throw new TypeError(
      `defineScope: ${value['column']}: value must be a function of the actor`,
    );
  }
  const session = value['session'];
  if (typeof session !== 'string' || !SESSION.test(session)) {
    throw new TypeError(
      `defineScope: ${value['column']}: session must be two dotted identifiers, such as app.organization_id`,
    );
  }
  return Object.freeze({ column: scope.column, value: scope.value, session });
}

function isScopeKey(value: unknown): value is ScopeKey {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/**
 * Each scope's value for `actor`, in the bindings' order, for
 * `StorageAdapter.transaction`. Throws `TypeError` when a binding's value
 * is not a string or a finite number, so an actor without a tenant never
 * runs unscoped.
 */
export function scopeValues<TActor>(
  bindings: Readonly<Record<string, Scope<string, TActor>>>,
  actor: TActor,
): ReadonlyArray<ScopeValue> {
  return Object.entries(bindings).map(([scope, binding]) => {
    const value: unknown = binding.value(actor);
    if (!isScopeKey(value)) {
      throw new TypeError(
        `scopeValues: scope ${scope} gave a value that is not a string or a finite number`,
      );
    }
    return Object.freeze({
      scope,
      column: binding.column,
      session: binding.session,
      value,
    });
  });
}
