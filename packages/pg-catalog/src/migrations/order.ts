/**
 * Migration order (SPEC 5, ADR 0003): Flyway's when every file follows its
 * naming, natural order otherwise.
 * @ref https://documentation.red-gate.com/fd/migrations-271585107.html
 * @ref https://documentation.red-gate.com/fd/versioned-migrations-273973333.html
 * @packageDocumentation
 */
import { PgCatalogError } from '../errors';
import { compareCodeUnits } from '../internal/code-units';

const VERSIONED = /^V(\d+(?:[._]\d+)*)__.*\.sql$/u;
const REPEATABLE = /^R__(.*)\.sql$/u;
const UNDO = /^U\d+(?:[._]\d+)*__.*\.sql$/u;
const DIGITS = /(\d+)/u;
const LEADING_ZEROS = /^0+(?=\d)/u;
const VERSION_SEPARATOR = /[._]/u;

function basename(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

/** Compares two digit runs as numbers without converting them, so any length is exact. */
function compareDigits(left: string, right: string): number {
  const a = left.replace(LEADING_ZEROS, '');
  const b = right.replace(LEADING_ZEROS, '');
  return a.length === b.length ? compareCodeUnits(a, b) : a.length - b.length;
}

/** The first comparison that orders the pair, or 0. */
function firstOrder(...orders: ReadonlyArray<number>): number {
  return orders.find((order) => order !== 0) ?? 0;
}

/**
 * Natural order: runs of digits compare as numbers, everything else by
 * UTF-16 code units (`2_x.sql` before `10_x.sql`). Names equal that way
 * (`01_a.sql`, `1_a.sql`) fall back to plain code unit order, so the order
 * is total.
 */
export function naturalCompare(left: string, right: string): number {
  // split() with a capture group puts the digit runs at the odd indexes.
  const a = left.split(DIGITS);
  const b = right.split(DIGITS);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const x = a[index] ?? '';
    const y = b[index] ?? '';
    const order =
      index % 2 === 1 ? compareDigits(x, y) : compareCodeUnits(x, y);
    if (order !== 0) {
      return order;
    }
  }
  return firstOrder(a.length - b.length, compareCodeUnits(left, right));
}

function compareVersions(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const order = compareDigits(left[index] ?? '', right[index] ?? '');
    if (order !== 0) {
      return order;
    }
  }
  return left.length - right.length;
}

/** The first two neighbours of a sorted list that `same` calls equal. */
function adjacentPair<T>(
  items: ReadonlyArray<T>,
  same: (left: T, right: T) => boolean,
): readonly [T, T] | undefined {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      same(previous, current)
    ) {
      return [previous, current];
    }
  }
  return undefined;
}

interface Versioned {
  readonly name: string;
  readonly version: ReadonlyArray<string>;
}

interface Repeatable {
  readonly name: string;
  readonly description: string;
}

function flywayOrder(names: ReadonlyArray<string>): ReadonlyArray<string> {
  const versioned: Array<Versioned> = [];
  const repeatable: Array<Repeatable> = [];
  for (const name of names) {
    const base = basename(name);
    const version = VERSIONED.exec(base)?.[1];
    const description = REPEATABLE.exec(base)?.[1];
    if (version !== undefined) {
      versioned.push({ name, version: version.split(VERSION_SEPARATOR) });
    } else if (description !== undefined) {
      repeatable.push({ name, description });
    }
  }
  versioned.sort((a, b) =>
    firstOrder(
      compareVersions(a.version, b.version),
      compareCodeUnits(a.name, b.name),
    ),
  );
  repeatable.sort((a, b) =>
    firstOrder(
      compareCodeUnits(a.description, b.description),
      compareCodeUnits(a.name, b.name),
    ),
  );
  const version = adjacentPair(
    versioned,
    (a, b) => compareVersions(a.version, b.version) === 0,
  );
  if (version !== undefined) {
    throw new PgCatalogError(
      'migrations_invalid',
      `migrations ${version[0].name} and ${version[1].name} have the same Flyway version`,
    );
  }
  const description = adjacentPair(
    repeatable,
    (a, b) => a.description === b.description,
  );
  if (description !== undefined) {
    throw new PgCatalogError(
      'migrations_invalid',
      `migrations ${description[0].name} and ${description[1].name} have the same Flyway description`,
    );
  }
  return [
    ...versioned.map((entry) => entry.name),
    ...repeatable.map((entry) => entry.name),
  ];
}

function isFlyway(name: string): boolean {
  const base = basename(name);
  return VERSIONED.test(base) || REPEATABLE.test(base) || UNDO.test(base);
}

/**
 * The SQL files of a directory listing (paths relative to it, `/`
 * separated) in the order replay runs them. `.down.sql` files and Flyway
 * undo files never run.
 */
export function orderMigrations(
  names: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const sql = names.filter(
    (name) => name.endsWith('.sql') && !name.endsWith('.down.sql'),
  );
  if (sql.length > 0 && sql.every((name) => isFlyway(name))) {
    return flywayOrder(sql);
  }
  return sql
    .filter((name) => !UNDO.test(basename(name)))
    .toSorted(naturalCompare);
}
