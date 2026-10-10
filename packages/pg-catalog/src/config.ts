/**
 * The configuration types (SPEC 11.1). `defineExtraction`, which validates
 * a configuration eagerly, and the drift and Kysely options arrive with the
 * commands that read them.
 * @packageDocumentation
 */
import type { MigrationSource } from './migrations/load';
import type { PgliteExtension } from './target/pglite';

/**
 * Where migrations replay. PGlite, the default, runs PostgreSQL 18
 * in-process; `extensions` names contrib extensions (`'pg_trgm'`) or passes
 * PGlite extension objects. A URL replays on a server inside a throwaway
 * database; a function is called only when the URL is needed, so a missing
 * environment variable fails only the command that needs it.
 */
export type DatabaseConfig =
  | {
      readonly pglite: {
        readonly extensions?: ReadonlyArray<string | PgliteExtension>;
      };
    }
  | { readonly url: string | (() => string | undefined) };

/**
 * The files `extract` writes, relative to the configuration file (or the
 * `cwd` option). `public` writes the slice of `tables` a browser may see.
 */
export interface OutputConfig {
  readonly catalog: string;
  readonly public?: {
    readonly file: string;
    readonly tables: ReadonlyArray<string>;
  };
}

/** An extraction: the migrations, where they replay, which schemas to read, and the files to write. */
export interface ExtractionConfig {
  /** A directory of `.sql` files, or a function returning the migrations in order. */
  readonly migrations: string | MigrationSource;
  /** Default `{ pglite: {} }`. */
  readonly database?: DatabaseConfig;
  /** Default `['public']`; the first is the default schema, whose objects are named without a prefix. */
  readonly schemas?: ReadonlyArray<string>;
  readonly out: OutputConfig;
}

/** The schemas read when the configuration names none (SPEC 15). */
export const DEFAULT_SCHEMAS: ReadonlyArray<string> = ['public'];
