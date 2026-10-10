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
/** Declarations that must not compile, each error marked by a `// error:` line above it. */
export const FAILS_DIR: string = fileURLToPath(
  new URL('../fails/', import.meta.url),
);
