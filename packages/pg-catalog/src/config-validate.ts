/**
 * The validation `defineExtraction` runs (SPEC 11.1): every mistake throws
 * a `TypeError` that names the option, so a misspelled `postgres:` fails
 * instead of being ignored. Options left `undefined` count as absent, as a
 * JavaScript configuration may write them.
 * @packageDocumentation
 */
import type { ExtractionConfig } from './config';

import {
  DEFAULT_CATALOG_INTERFACE,
  DEFAULT_PUBLIC_INTERFACE,
  INTERFACE_NAME,
} from './render/catalog-module';

/** `drift` environment names: what a CLI flag and a CI job name can carry. */
const ENVIRONMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
/** `NAMEDATALEN - 1` (SPEC 15). */
const MAX_SCHEMA_BYTES = 63;
const CAMEL_CASE_OPTIONS = [
  'upperCase',
  'underscoreBeforeDigits',
  'underscoreBetweenUppercaseLetters',
];
const encoder = new TextEncoder();

type Options = Readonly<Record<string, unknown>>;

function fail(message: string): never {
  throw new TypeError(`defineExtraction: ${message}`);
}

function isOptions(value: unknown): value is Options {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function member(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** An object of options; with `keys`, any other key is a mistake. */
function options(
  value: unknown,
  path: string,
  keys?: ReadonlyArray<string>,
): Options {
  if (!isOptions(value)) {
    fail(`${path} must be an object`);
  }
  const unknown = Object.keys(value).find(
    (key) => keys !== undefined && !keys.includes(key),
  );
  if (unknown !== undefined) {
    fail(`${member(path, unknown)} is not an option`);
  }
  return value;
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    fail(`${path} must be a string`);
  }
  if (value === '') {
    fail(`${path} must not be empty`);
  }
}

function textOrFunction(value: unknown, path: string): void {
  if (typeof value !== 'function' && typeof value !== 'string') {
    fail(`${path} must be a string or a function`);
  }
  if (value === '') {
    fail(`${path} must not be empty`);
  }
}

function texts(value: unknown, path: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  const seen = new Set<string>();
  value.forEach((item: unknown, index) => {
    text(item, `${path}[${index}]`);
    if (seen.has(item)) {
      fail(`${path} lists ${item} twice`);
    }
    seen.add(item);
  });
  return [...seen];
}

function schemas(value: unknown): void {
  const names = texts(value, 'schemas');
  if (names.length === 0) {
    fail('schemas must not be empty');
  }
  names.forEach((name, index) => {
    if (encoder.encode(name).length > MAX_SCHEMA_BYTES) {
      fail(`schemas[${index}] is longer than ${MAX_SCHEMA_BYTES} bytes`);
    }
    if (name.startsWith('pg_') || name === 'information_schema') {
      fail(`schemas[${index}] is a system schema`);
    }
  });
}

function extensions(value: unknown): void {
  const path = 'database.pglite.extensions';
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  value.forEach((item: unknown, index) => {
    // A PGlite extension object belongs to PGlite, so only what replay uses is checked.
    if (isOptions(item)) {
      text(item['name'], `${path}[${index}].name`);
      if (typeof item['setup'] !== 'function') {
        fail(`${path}[${index}].setup must be a function`);
      }
    } else {
      text(item, `${path}[${index}]`);
    }
  });
}

function database(value: unknown): void {
  const config = options(value, 'database', ['pglite', 'url']);
  const pglite = config['pglite'];
  const url = config['url'];
  if ((pglite === undefined) === (url === undefined)) {
    fail('database needs exactly one of pglite and url');
  }
  if (url !== undefined) {
    textOrFunction(url, 'database.url');
    return;
  }
  const extensionList = options(pglite, 'database.pglite', ['extensions'])[
    'extensions'
  ];
  if (extensionList !== undefined) {
    extensions(extensionList);
  }
}

function overrides(value: unknown): void {
  for (const [key, override] of Object.entries(
    options(value, 'out.types.overrides'),
  )) {
    const path = `out.types.overrides.${key}`;
    if (typeof override === 'string') {
      text(override, path);
      continue;
    }
    const positions = options(override, path, ['select', 'insert', 'update']);
    text(positions['select'], `${path}.select`);
    for (const position of ['insert', 'update']) {
      if (positions[position] !== undefined) {
        text(positions[position], `${path}.${position}`);
      }
    }
  }
}

function camelCase(value: unknown): void {
  if (typeof value === 'boolean') {
    return;
  }
  const config = options(value, 'out.types.camelCase', CAMEL_CASE_OPTIONS);
  for (const [key, flag] of Object.entries(config)) {
    if (flag !== undefined && typeof flag !== 'boolean') {
      fail(`out.types.camelCase.${key} must be a boolean`);
    }
  }
}

function types(value: unknown): void {
  if (typeof value === 'string') {
    text(value, 'out.types');
    return;
  }
  const config = options(value, 'out.types', [
    'file',
    'overrides',
    'imports',
    'camelCase',
  ]);
  text(config['file'], 'out.types.file');
  if (config['overrides'] !== undefined) {
    overrides(config['overrides']);
  }
  if (config['imports'] !== undefined) {
    texts(config['imports'], 'out.types.imports');
  }
  if (config['camelCase'] !== undefined) {
    camelCase(config['camelCase']);
  }
}

/** The interface a module exports: `fallback` when the option is absent. */
function interfaceName(value: unknown, path: string, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  text(value, path);
  if (!INTERFACE_NAME.test(value)) {
    fail(
      `${path} must be an ASCII identifier that starts with an uppercase letter`,
    );
  }
  return value;
}

/** Validates `out.catalog` and returns the interface it exports. */
function catalogFile(value: unknown): string {
  if (typeof value === 'string') {
    text(value, 'out.catalog');
    return DEFAULT_CATALOG_INTERFACE;
  }
  if (!isOptions(value)) {
    fail('out.catalog must be a string or an object');
  }
  const config = options(value, 'out.catalog', ['file', 'interface']);
  text(config['file'], 'out.catalog.file');
  return interfaceName(
    config['interface'],
    'out.catalog.interface',
    DEFAULT_CATALOG_INTERFACE,
  );
}

/** Validates `out.public` and returns the interface it exports. */
function publicFile(value: unknown): string {
  const config = options(value, 'out.public', ['file', 'tables', 'interface']);
  text(config['file'], 'out.public.file');
  if (texts(config['tables'], 'out.public.tables').length === 0) {
    fail('out.public.tables must not be empty');
  }
  return interfaceName(
    config['interface'],
    'out.public.interface',
    DEFAULT_PUBLIC_INTERFACE,
  );
}

function out(value: unknown): void {
  const config = options(value, 'out', ['catalog', 'public', 'types']);
  const catalogInterface = catalogFile(config['catalog']);
  if (
    config['public'] !== undefined &&
    publicFile(config['public']) === catalogInterface
  ) {
    // Both modules may be imported together, and one name would leave a message ambiguous.
    fail(
      `out.public.interface must differ from the catalog's interface, ${catalogInterface}`,
    );
  }
  if (config['types'] !== undefined) {
    types(config['types']);
  }
}

function drift(value: unknown): void {
  for (const [name, environment] of Object.entries(options(value, 'drift'))) {
    if (!ENVIRONMENT_NAME.test(name)) {
      fail(
        `drift environment ${JSON.stringify(name)} must match ${ENVIRONMENT_NAME.source}`,
      );
    }
    const config = options(environment, `drift.${name}`, ['url']);
    textOrFunction(config['url'], `drift.${name}.url`);
  }
}

/** Throws a `TypeError` naming the first option that is wrong. */
export function validateConfig(
  value: unknown,
): asserts value is ExtractionConfig {
  if (!isOptions(value)) {
    fail('the configuration must be an object');
  }
  const config = options(value, '', [
    'migrations',
    'database',
    'schemas',
    'out',
    'drift',
  ]);
  textOrFunction(config['migrations'], 'migrations');
  if (config['database'] !== undefined) {
    database(config['database']);
  }
  if (config['schemas'] !== undefined) {
    schemas(config['schemas']);
  }
  out(config['out']);
  if (config['drift'] !== undefined) {
    drift(config['drift']);
  }
}
