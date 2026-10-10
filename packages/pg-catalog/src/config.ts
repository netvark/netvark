/**
 * The configuration types (SPEC 11.1). `defineExtraction`, which validates
 * a configuration eagerly, arrives with the CLI.
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
 * A TypeScript type for a column type in Kysely's select, insert, and
 * update positions; a missing position takes `select`'s type.
 */
export interface TypeOverride {
  readonly select: string;
  readonly insert?: string;
  readonly update?: string;
}

/**
 * The options of Kysely's `CamelCasePlugin` that change names; give the
 * ones the application gives the plugin.
 * @ref https://kysely-org.github.io/kysely-apidoc/interfaces/CamelCasePluginOptions.html
 */
export interface CamelCaseOptions {
  readonly upperCase?: boolean;
  readonly underscoreBeforeDigits?: boolean;
  readonly underscoreBetweenUppercaseLetters?: boolean;
}

/** The Kysely types file and how it maps types (SPEC 9.2). */
export interface TypesConfig {
  readonly file: string;
  /**
   * Types keyed by a column's `type` (or `<type>[]` for its arrays), for
   * applications that register their own parsers or use another driver: a
   * TypeScript type for all three positions, or one per position.
   */
  readonly overrides?: Readonly<Record<string, string | TypeOverride>>;
  /** Import statements written verbatim after Kysely's, for the types overrides name. */
  readonly imports?: ReadonlyArray<string>;
  /**
   * Table and column keys as Kysely's `CamelCasePlugin` names them, for
   * applications that use it: `true`, or the plugin's options.
   */
  readonly camelCase?: boolean | CamelCaseOptions;
}

/**
 * The files `extract` writes, relative to the configuration file (or the
 * `cwd` option). `public` writes the slice of `tables` a browser may see;
 * `types` writes the Kysely types, as a path or with options.
 */
export interface OutputConfig {
  readonly catalog: string;
  readonly public?: {
    readonly file: string;
    readonly tables: ReadonlyArray<string>;
  };
  readonly types?: string | TypesConfig;
}

/**
 * A live database `drift` compares with the committed catalog. The URL is
 * meant for a read-only role with `CONNECT` and `USAGE` on the configured
 * schemas; a function is called only when drift runs for this environment.
 */
export interface DriftEnvironment {
  readonly url: string | (() => string | undefined);
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
  /** The live databases `drift` can compare, by environment name. */
  readonly drift?: Readonly<Record<string, DriftEnvironment>>;
}

/** The schemas read when the configuration names none (SPEC 15). */
export const DEFAULT_SCHEMAS: ReadonlyArray<string> = ['public'];
