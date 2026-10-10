/**
 * `defineCodec` (SPEC 7.1): the public facet of a value type that has no
 * wire form (5.1), or that the application represents its own way. Its
 * fixtures are wire values `pg-catalog rules --check` round-trips through
 * the database (7.3, ADR 0006); here they are checked against the schema,
 * so a codec never ships with an example its own schema refuses. The
 * storage facet lives in the storage adapter (`StorageCodecs`).
 * @packageDocumentation
 */
import type { $ZodType, input } from 'zod/v4/core';

import type { Codec, NonEmptyList } from './types';

import {
  expectKnownKeys,
  expectRecord,
  optionalString,
} from '../internal/expect';
import { expectFixtureList, expectSchema, rejection } from './fixtures';

const DEFINE_CODEC = 'defineCodec';
const CODEC_KEYS: ReadonlyArray<string> = [
  'types',
  'schema',
  'fixtures',
  'description',
];

/** What `defineCodec` takes. */
export interface CodecInit<
  TTypes extends NonEmptyList<string>,
  TSchema extends $ZodType,
> {
  /** Type reference names it attaches to: base types, enums, domains, `<type>[]`. */
  readonly types: TTypes;
  /** The public schema: what the wire carries. */
  readonly schema: TSchema;
  /** Wire values the schema accepts, round-tripped by the oracle. */
  readonly fixtures: NonEmptyList<NoInfer<input<TSchema>>>;
  readonly description?: string | undefined;
}

const CODECS = new WeakSet<object>();

/** The values a codec's schema must reject, and why. */
const ABSENT_VALUES: ReadonlyArray<readonly [unknown, string]> = [
  [
    undefined,
    'must reject undefined, so a member a client leaves out stays out',
  ],
  [null, "must reject null; the column's nullability decides null"],
];

/** Whether a value was returned by `defineCodec`. */
export function isCodec(value: unknown): value is Codec {
  return typeof value === 'object' && value !== null && CODECS.has(value);
}

function expectTypeNames(path: string, value: unknown): NonEmptyList<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((type) => typeof type === 'string' && type !== '')
  ) {
    throw new TypeError(`${path}: must be a non-empty list of type names`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the checks above establish a non-empty list of strings, which `every` cannot narrow to a tuple
  return value as unknown as NonEmptyList<string>;
}

/**
 * A codec describes present, non-null values: the column decides `null`
 * (SPEC 6.1 step 4), and a member a client leaves out stays out (6.2). A
 * schema that accepts `undefined`, through `.optional()`, `.default()`,
 * `.prefault()`, or `.catch()`, would put a value in place of an omitted
 * member, and one that accepts `null` would let `null` past a NOT NULL
 * column.
 */
function expectPresentValues(schema: $ZodType): void {
  const path = `${DEFINE_CODEC}.schema`;
  for (const [value, reason] of ABSENT_VALUES) {
    if (rejection(path, schema, value) === undefined) {
      throw new TypeError(`${path}: ${reason}`);
    }
  }
}

/**
 * Declares a codec for a definer's `codecs`, returned frozen. Throws
 * `TypeError` when `types` is empty or holds a non-string, when `fixtures`
 * is empty, when the schema rejects a fixture (naming its index, with
 * Zod's error as the cause), when the schema accepts `undefined` or
 * `null`, or when the schema parses asynchronously.
 */
export function defineCodec<
  const TTypes extends NonEmptyList<string>,
  TSchema extends $ZodType,
>(init: CodecInit<TTypes, TSchema>): Codec<TTypes, TSchema> {
  const value = expectRecord(DEFINE_CODEC, init);
  expectKnownKeys(DEFINE_CODEC, value, CODEC_KEYS);
  const types = expectTypeNames(`${DEFINE_CODEC}.types`, value['types']);
  const schema = expectSchema(`${DEFINE_CODEC}.schema`, value['schema']);
  const fixtures = expectFixtureList(
    `${DEFINE_CODEC}.fixtures`,
    value['fixtures'],
  );
  for (const [index, fixture] of fixtures.entries()) {
    const error = rejection(`${DEFINE_CODEC}.schema`, schema, fixture);
    if (error !== undefined) {
      throw new TypeError(
        `${DEFINE_CODEC}.fixtures[${String(index)}]: the schema rejects this fixture`,
        { cause: error },
      );
    }
  }
  expectPresentValues(schema);
  const codec = Object.freeze({
    types: Object.freeze([...types]),
    schema,
    fixtures: Object.freeze([...fixtures]),
    description: optionalString(
      `${DEFINE_CODEC}.description`,
      value['description'],
    ),
  });
  CODECS.add(codec);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the value is the checked init, frozen; its literal types are the caller's, and the mark is type-only (`types.ts`)
  return codec as unknown as Codec<TTypes, TSchema>;
}
