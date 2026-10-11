import type { Kysely } from 'kysely';

/**
 * The options of `createKyselyStorage` (SPEC 18.2), checked once when the
 * adapter is created: a value JavaScript lets through that the adapter
 * cannot use throws `TypeError` naming the option, before any query runs,
 * and so does a key that is not an option, such as a misspelled `outbox`.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@netvark/catalog-core';
import type { DefineDefaultedKeyset } from '@netvark/keyset-core';
import type { AnyDatabase } from '@netvark/kysely-keyset';

import type { KyselyStorage, KyselyStorageOptions, TextCodec } from './types';

import { CATALOG_FORMAT } from '@netvark/catalog-core';

import { isRecord } from '../internal/object';

const CALLER = 'createKyselyStorage';
const OPTIONS: ReadonlySet<string> = new Set([
  'db',
  'catalog',
  'codecs',
  'defineKeyset',
  'outbox',
]);
const OUTBOX_OPTIONS: ReadonlySet<string> = new Set(['table', 'schema']);
/** The schema of an outbox table that names none: the schema PostgreSQL creates in every database, and the catalog's default. */
const DEFAULT_OUTBOX_SCHEMA = 'public';

/** The options as the adapter uses them. */
export interface StorageConfig {
  /** `options.db` without its plugins. */
  readonly db: Kysely<AnyDatabase>;
  readonly catalog: PublicCatalog;
  readonly codecs: Readonly<Record<string, TextCodec>>;
  readonly defineKeyset: DefineDefaultedKeyset;
  readonly outbox: KyselyStorage['outbox'];
}

function checkKeys(
  path: string,
  value: Readonly<Record<string, unknown>>,
  known: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      throw new TypeError(`${CALLER}: ${path}.${key} is not an option`);
    }
  }
}

function checkDb(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value['withoutPlugins'] !== 'function' ||
    typeof value['transaction'] !== 'function'
  ) {
    throw new TypeError(`${CALLER}: options.db must be a Kysely instance`);
  }
}

/** The checks resource-core's definer applies to its catalog, so one object serves both. */
function checkCatalog(value: unknown): void {
  const path = `${CALLER}: options.catalog`;
  if (!isRecord(value)) {
    throw new TypeError(
      `${path} must be the public catalog the declarations are built from`,
    );
  }
  if (Object.hasOwn(value, 'schemas')) {
    throw new TypeError(
      `${path}: a full catalog; pass the public catalog the declarations are built from (toPublicCatalog)`,
    );
  }
  if (value['format'] !== CATALOG_FORMAT) {
    throw new TypeError(
      `${path}: format ${String(value['format'])} is not supported (expected ${String(CATALOG_FORMAT)})`,
    );
  }
  for (const member of ['enums', 'domains', 'tables']) {
    if (!isRecord(value[member])) {
      throw new TypeError(`${path}.${member} must be an object`);
    }
  }
}

function checkCodecs(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new TypeError(
      `${CALLER}: options.codecs must be an object of storage codecs by codec name`,
    );
  }
  for (const [name, codec] of Object.entries(value)) {
    for (const member of ['read', 'write']) {
      if (!isRecord(codec) || typeof codec[member] !== 'function') {
        throw new TypeError(
          `${CALLER}: options.codecs.${name}.${member} must be a function`,
        );
      }
    }
  }
}

function checkDefiner(value: unknown): void {
  if (typeof value !== 'function') {
    throw new TypeError(
      `${CALLER}: options.defineKeyset must be the server's keyset definer: createDefineKeyset({ cursor })`,
    );
  }
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function outboxName(value: unknown): KyselyStorage['outbox'] {
  if (value === undefined) {
    return undefined;
  }
  const path = `${CALLER}: options.outbox`;
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be { table, schema? }`);
  }
  checkKeys('options.outbox', value, OUTBOX_OPTIONS);
  const { table, schema = DEFAULT_OUTBOX_SCHEMA } = value;
  if (!isName(table)) {
    throw new TypeError(`${path}.table must be a table name`);
  }
  if (!isName(schema)) {
    throw new TypeError(`${path}.schema must be a schema name`);
  }
  return Object.freeze({ schema, table });
}

/** `db` without its plugins, typed for statements over any table. */
function plain<TDatabase>(db: Kysely<TDatabase>): Kysely<AnyDatabase> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every table and column the adapter names comes from the catalog the declarations were checked against, so the application's DB type adds nothing to its statements
  return db.withoutPlugins() as unknown as Kysely<AnyDatabase>;
}

/** The checked options; throws `TypeError` naming the first option the adapter cannot use. */
export function storageConfig<TDatabase>(
  options: KyselyStorageOptions<TDatabase>,
): StorageConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options must be an object`);
  }
  checkKeys('options', value, OPTIONS);
  checkDb(value['db']);
  checkCatalog(value['catalog']);
  checkCodecs(value['codecs']);
  checkDefiner(value['defineKeyset']);
  return {
    db: plain(options.db),
    catalog: options.catalog,
    codecs: options.codecs ?? {},
    defineKeyset: options.defineKeyset,
    outbox: outboxName(value['outbox']),
  };
}
