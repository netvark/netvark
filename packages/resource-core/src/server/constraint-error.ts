/**
 * `constraintError(thrown, { resource, operation, pointer })` (SPEC 9.5):
 * the declared error of a PostgreSQL integrity violation raised inside an
 * operation, or `undefined` for anything it does not own, which the ban's
 * `map` (typically `postgresMapper()`) then handles with its SQLSTATE
 * table. It runs inside the operation because only there are the
 * operation and the base of the document known. The driver error is found
 * and read by `@netvark/ban-core/postgresql`, so node-postgres, PGlite,
 * postgres.js, Neon, and Bun need no import here.
 *
 * A NOT NULL violation names its table and column but no constraint on any
 * supported major, so its rule key is the NOT NULL key; a domain's CHECK
 * names the domain in field `d` and no table; every other violation names
 * its table and constraint. A violation is matched by schema and name, and
 * a found code is kept only when its constraint kind is the one the
 * SQLSTATE reports, since a unique index may share its name with a CHECK
 * or FOREIGN KEY constraint of its table (catalog ADR 0009). A remove
 * carries no members, so every integrity violation it raises is another
 * row's: a reference that blocks it (23503, or 23001 for `ON DELETE
 * RESTRICT` from PostgreSQL 18) or a referential action whose result breaks
 * a constraint of the referencing row, such as `ON DELETE SET NULL` against
 * a CHECK. It names the referencing table, which may not be a declared
 * resource, so it is the built-in `CONFLICT`.
 * @ref https://www.postgresql.org/docs/18/protocol-error-fields.html
 * @ref https://www.postgresql.org/docs/18/errcodes-appendix.html
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c (ri_ReportViolation: ERRCODE_RESTRICT_VIOLATION)
 * @packageDocumentation
 */
import type { PostgresErrorFields } from '@netvark/ban-core/postgresql';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';
import type { Operation } from '../declare/types';
import type { ConstraintKind } from '../errors/error-entry';

import { BanError, BUILTIN_CATALOG } from '@netvark/ban-core';
import {
  findPostgresError,
  readPostgresFields,
} from '@netvark/ban-core/postgresql';

import { notNullKey } from '../catalog/columns';
import { OPERATIONS } from '../declare/check-options';
import { internalsOf } from '../declare/declared-resource';
import { KIND_DETAIL } from '../errors/error-entry';
import { isRecord, ownValue } from '../internal/object';
import { memberItems, memberTokens, pointerTokens } from './member-items';

/** What `constraintError` needs to know about the operation. */
export interface ConstraintErrorOptions {
  /** The declared resource the operation runs on. */
  readonly resource: AnyDeclaredResource;
  readonly operation: Operation;
  /** The RFC 6901 pointer of the operation's resource object; default `/data`. */
  readonly pointer?: string | undefined;
}

/** The constraint kinds each integrity SQLSTATE reports. */
const SQLSTATE_KINDS: ReadonlyMap<
  string,
  ReadonlySet<ConstraintKind>
> = new Map([
  ['23502', new Set<ConstraintKind>(['notNull'])],
  ['23503', new Set<ConstraintKind>(['foreignKey'])],
  ['23505', new Set<ConstraintKind>(['unique', 'primaryKey'])],
  ['23514', new Set<ConstraintKind>(['check'])],
  ['23P01', new Set<ConstraintKind>(['exclusion'])],
]);
const NOT_NULL_VIOLATION = '23502';
/** SQLSTATE class 23, integrity constraint violation. */
const INTEGRITY_VIOLATION_CLASS = '23';
const STILL_REFERENCED = 'The resource is still referenced.';
const DEFAULT_POINTER = '/data';

interface Checked {
  readonly internals: DeclaredInternals;
  readonly operation: Operation;
  readonly base: ReadonlyArray<string>;
}

function checkOptions(options: unknown): Checked {
  const value = isRecord(options) ? options : {};
  const internals = internalsOf(value['resource']);
  if (internals === undefined) {
    throw new TypeError(
      'constraintError: options.resource must be a resource declareResource returned',
    );
  }
  const operation = OPERATIONS.find((known) => known === value['operation']);
  if (operation === undefined) {
    throw new TypeError(
      `constraintError: options.operation must be one of ${OPERATIONS.join(', ')}`,
    );
  }
  const pointer = value['pointer'] ?? DEFAULT_POINTER;
  const base = typeof pointer === 'string' ? pointerTokens(pointer) : undefined;
  if (base === undefined) {
    throw new TypeError(
      'constraintError: options.pointer must be an RFC 6901 JSON Pointer',
    );
  }
  return { internals, operation, base };
}

/** The code of a domain CHECK the violation names by its domain, schema, and constraint. */
function domainCheckCode(
  internals: DeclaredInternals,
  fields: PostgresErrorFields,
): string | undefined {
  for (const [name, checks] of internals.domainChecks) {
    const domain = ownValue(internals.catalog.domains, name);
    if (
      domain !== undefined &&
      domain.schema === fields.schema &&
      domain.name === fields.dataType
    ) {
      return fields.constraint === undefined
        ? undefined
        : checks.get(fields.constraint);
    }
  }
  return undefined;
}

/** The code of the rule the violation names, before its kind is checked. */
function codeOf(
  internals: DeclaredInternals,
  fields: PostgresErrorFields,
): string | undefined {
  const { resource, catalog } = internals;
  if (fields.table === undefined) {
    return domainCheckCode(internals, fields);
  }
  const tableDef = ownValue(catalog.tables, resource.table);
  if (
    tableDef === undefined ||
    tableDef.schema !== fields.schema ||
    tableDef.name !== fields.table
  ) {
    return undefined;
  }
  if (fields.sqlstate === NOT_NULL_VIOLATION) {
    return fields.column === undefined
      ? undefined
      : resource.names.rules.get(notNullKey(tableDef, fields.column));
  }
  return fields.constraint === undefined
    ? undefined
    : resource.names.rules.get(fields.constraint);
}

/**
 * The declared error of a PostgreSQL integrity violation raised inside an
 * operation on `options.resource`: the code's status and title, its
 * constraint kind's constant detail, one item per member of the code's
 * `fields` under `options.pointer`, and the driver error, never a wrapper,
 * as `cause`. `undefined` when `thrown` carries no PostgreSQL error or a
 * violation the resource declares no code for. Throws `TypeError` for
 * options that do not name a declared resource, an operation, and a
 * pointer.
 */
export function constraintError(
  thrown: unknown,
  options: ConstraintErrorOptions,
): BanError | undefined {
  const { internals, operation, base } = checkOptions(options);
  const driverError = findPostgresError(thrown);
  if (driverError === undefined) {
    return undefined;
  }
  const fields = readPostgresFields(driverError);
  if (
    operation === 'remove' &&
    fields.sqlstate.startsWith(INTEGRITY_VIOLATION_CLASS)
  ) {
    return new BanError({
      ...BUILTIN_CATALOG.CONFLICT,
      code: 'CONFLICT',
      detail: STILL_REFERENCED,
      cause: driverError,
    });
  }
  const code = codeOf(internals, fields);
  const { names, errors } = internals.resource;
  const entry = code === undefined ? undefined : ownValue(errors, code);
  if (
    code === undefined ||
    entry === undefined ||
    SQLSTATE_KINDS.get(fields.sqlstate)?.has(entry.kind) !== true
  ) {
    return undefined;
  }
  const detail = KIND_DETAIL[entry.kind];
  const paths = entry.fields.flatMap((member) => {
    const tokens = memberTokens(names, member);
    return tokens === undefined ? [] : [tokens];
  });
  return new BanError({
    status: entry.status,
    code,
    title: entry.title,
    detail,
    errors: memberItems(base, paths, detail),
    cause: driverError,
  });
}
