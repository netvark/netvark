/** Paths inside this package, for the tests that run a bin in it. */
import { fileURLToPath } from 'node:url';

/** The package directory, which `fails/tsconfig.json` is relative to. */
export const PACKAGE_DIR: string = fileURLToPath(
  new URL('../', import.meta.url),
);
/** The contacts application's database directory: migrations, extraction config, and the two catalogs. */
export const CONTACTS_DIR: string = fileURLToPath(
  new URL('../fixtures/contacts/', import.meta.url),
);
/** The oracle's schema (SPEC 15.3): its migrations, extraction config, and the two catalogs. */
export const ORACLE_DIR: string = fileURLToPath(
  new URL('../fixtures/oracle/', import.meta.url),
);
/** The PostgreSQL 18 schema (SPEC 15.4): NOT ENFORCED constraints, with its extraction config and the two catalogs. */
export const POSTGRES18_DIR: string = fileURLToPath(
  new URL('../fixtures/postgres18/', import.meta.url),
);
/** Declarations that must not compile, each error marked by a `// error:` line above it. */
export const FAILS_DIR: string = fileURLToPath(
  new URL('../fails/', import.meta.url),
);
