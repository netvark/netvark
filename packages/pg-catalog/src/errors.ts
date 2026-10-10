/**
 * The errors commands raise (SPEC 12). Every failure is a `PgCatalogError`
 * with a stable `code`; the message names the file, object, or setting
 * involved (the application's own data, never a client's), and the
 * PostgreSQL error is the `cause` where there is one. The CLI exits 2 on
 * all of them.
 * @packageDocumentation
 */

export type PgCatalogErrorCode =
  | 'config_invalid'
  | 'pglite_missing'
  | 'migrations_invalid'
  | 'migration_failed'
  | 'connection_failed'
  | 'unsupported_server'
  | 'schema_usage'
  | 'unsafe_name'
  | 'duplicate_key'
  | 'public_table_unknown'
  | 'name_collision'
  | 'camel_case_mismatch'
  | 'catalog_unreadable'
  | 'catalog_format';

/** A failure of an extraction, check, or drift command. */
export class PgCatalogError extends Error {
  readonly code: PgCatalogErrorCode;

  constructor(
    code: PgCatalogErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PgCatalogError';
    this.code = code;
  }
}

/** Narrows an unknown thrown value to a `PgCatalogError`. */
export function isPgCatalogError(value: unknown): value is PgCatalogError {
  return value instanceof PgCatalogError;
}
