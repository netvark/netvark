/**
 * `createDefineKeyset` (SPEC 3.6): a `defineKeyset` configured once with
 * what every definition of an application shares: the cursor secrets and
 * expiry, the page bounds, and the text search configuration. The defaults
 * are checked here, at startup, and merged under each definition member by
 * member; a member the definition sets, even to `undefined`, replaces the
 * default. They live in the module that exports the configured definer,
 * never in module-level state, so two applications in one process cannot
 * collide (ADR 0014).
 * @packageDocumentation
 */
import type { Keyset, NoRelations } from './define-keyset';
import type {
  CursorInit,
  FieldsInit,
  KeysetInit,
  PageInit,
  RelationsInit,
  SearchInit,
} from './types';

import { createCursorCodec } from '../cursor/codec';
import { isRecord } from '../internal/object';
import {
  defineKeyset,
  isSearchConfig,
  positiveInteger,
  SEARCH_CONFIG,
} from './define-keyset';

/**
 * What a configured definer merges under every definition (SPEC 3.6): the
 * cursor secrets and expiry, the page bounds, and the text search
 * configuration an application shares.
 */
export interface KeysetDefaults {
  readonly cursor?: CursorInit | undefined;
  readonly page?: PageInit | undefined;
  readonly search?:
    | {
        /** The `regconfig` of every full-text search that names none. */
        readonly config?: string | undefined;
      }
    | undefined;
}

/**
 * A definition for a definer whose defaults carry a cursor (SPEC 3.6): its
 * own `cursor` is optional, and the members it sets replace the default's.
 */
export interface DefaultedKeysetInit<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
> extends Omit<KeysetInit<TFields, TRelations>, 'cursor'> {
  readonly cursor?: Partial<CursorInit> | undefined;
}

/** The signature of `defineKeyset`: every definition names its cursor. */
export type DefineKeyset = typeof defineKeyset;

/** A configured definer whose defaults carry a cursor. */
export type DefineDefaultedKeyset = <
  const TFields extends FieldsInit,
  const TRelations extends RelationsInit = NoRelations,
>(
  init: DefaultedKeysetInit<TFields, TRelations>,
) => Keyset<TFields, TRelations>;

/** `value` when it is an object or absent; anything else names `what`. */
function optionalObject(
  what: string,
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (value !== undefined && !isRecord(value)) {
    throw new TypeError(`${what} must be an object`);
  }
  return value;
}

/** The checks `defineKeyset` applies to a whole definition, per member. */
function checkDefaults(defaults: KeysetDefaults): void {
  const value: unknown = defaults;
  if (!isRecord(value)) {
    throw new TypeError('createDefineKeyset requires an object');
  }
  if (defaults.cursor !== undefined) {
    optionalObject('cursor', defaults.cursor);
    createCursorCodec(defaults.cursor);
  }
  const page = optionalObject('page', defaults.page);
  if (page !== undefined) {
    // A bound the defaults leave out is the definition's to set, so only a
    // pair the defaults state together is compared.
    const max = positiveInteger('page.max', page['max'], Infinity);
    if (positiveInteger('page.default', page['default'], 1) > max) {
      throw new TypeError('page.default must not exceed page.max');
    }
    if (page['range'] !== undefined && typeof page['range'] !== 'boolean') {
      throw new TypeError('page.range must be a boolean');
    }
  }
  const config = optionalObject('search', defaults.search)?.['config'];
  if (config !== undefined && !isSearchConfig(config)) {
    throw new TypeError(`search.config must match ${SEARCH_CONFIG.source}`);
  }
}

/** The definition's search with the default configuration under it. */
function mergeSearch(
  defaults: KeysetDefaults,
  search: SearchInit | undefined,
): SearchInit | undefined {
  const config = defaults.search?.config;
  if (search === undefined || search.mode === 'like' || config === undefined) {
    return search;
  }
  return { config, ...search };
}

/** The definition with the defaults under it, ready for `defineKeyset`. */
function merge<TFields extends FieldsInit, TRelations extends RelationsInit>(
  defaults: KeysetDefaults,
  init: DefaultedKeysetInit<TFields, TRelations>,
): KeysetInit<TFields, TRelations> {
  if (!isRecord(init)) {
    throw new TypeError('defineKeyset requires an object');
  }
  optionalObject('page', init.page);
  optionalObject('search', init.search);
  optionalObject('cursor', init.cursor);
  const cursor = { ...defaults.cursor, ...init.cursor };
  const { secret } = cursor;
  if (secret === undefined) {
    throw new TypeError(
      'cursor.secret must be set by the definition or the defaults',
    );
  }
  return {
    ...init,
    page:
      defaults.page === undefined
        ? init.page
        : { ...defaults.page, ...init.page },
    search: mergeSearch(defaults, init.search),
    cursor: { ...cursor, secret },
  };
}

/**
 * Returns a `defineKeyset` that merges `defaults` under every definition.
 * Defaults that hold a cursor make each definition's `cursor` optional;
 * a default the definition cannot use throws `TypeError` here, at startup.
 *
 * ```ts
 * export const defineKeyset = createDefineKeyset({
 *   cursor: { secret: env.CURSOR_SECRET },
 *   page: { default: 25, max: 100 },
 * });
 * ```
 */
export function createDefineKeyset(
  defaults: KeysetDefaults & { readonly cursor: CursorInit },
): DefineDefaultedKeyset;
export function createDefineKeyset(defaults?: KeysetDefaults): DefineKeyset;
export function createDefineKeyset(
  defaults: KeysetDefaults = {},
): DefineDefaultedKeyset {
  checkDefaults(defaults);
  return function configured<
    const TFields extends FieldsInit,
    const TRelations extends RelationsInit = NoRelations,
  >(
    init: DefaultedKeysetInit<TFields, TRelations>,
  ): Keyset<TFields, TRelations> {
    return defineKeyset<TFields, TRelations>(merge(defaults, init));
  };
}
