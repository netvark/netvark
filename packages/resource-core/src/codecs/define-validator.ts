/**
 * `defineValidator` (SPEC 7.2): the request-side twin of a CHECK the
 * recognizer could not translate. Its fixtures are what
 * `pg-catalog rules --check` substitutes into the CHECK expression (7.3,
 * ADR 0006); here the schema must accept every `accept` fixture and reject
 * every `reject` fixture, so the examples and the schema cannot disagree.
 * @packageDocumentation
 */
import type { $ZodType, input } from 'zod/v4/core';

import type { NonEmptyList, Validator } from './types';

import {
  expectKnownKeys,
  expectRecord,
  optionalString,
} from '../internal/expect';
import { expectFixtureList, expectSchema, rejection } from './fixtures';

const DEFINE_VALIDATOR = 'defineValidator';
const VALIDATOR_KEYS: ReadonlyArray<string> = [
  'schema',
  'fixtures',
  'description',
];
const FIXTURE_KEYS: ReadonlyArray<string> = ['accept', 'reject'];

/** What `defineValidator` takes. */
export interface ValidatorInit<TSchema extends $ZodType> {
  /** Input: the field's value, or an object of the CHECK's fields by public name. */
  readonly schema: TSchema;
  readonly fixtures: {
    readonly accept: NonEmptyList<NoInfer<input<TSchema>>>;
    readonly reject: NonEmptyList<NoInfer<input<TSchema>>>;
  };
  readonly description?: string | undefined;
}

const VALIDATORS = new WeakSet<object>();

/** Whether a value was returned by `defineValidator`. */
export function isValidator(value: unknown): value is Validator {
  return typeof value === 'object' && value !== null && VALIDATORS.has(value);
}

/** The fixtures of one list, each of which the schema must accept (`accept`) or reject (`reject`). */
function checkList(
  schema: $ZodType,
  fixtures: Readonly<Record<string, unknown>>,
  list: 'accept' | 'reject',
): ReadonlyArray<unknown> {
  const path = `${DEFINE_VALIDATOR}.fixtures.${list}`;
  const values = expectFixtureList(path, fixtures[list]);
  for (const [index, fixture] of values.entries()) {
    const error = rejection(`${DEFINE_VALIDATOR}.schema`, schema, fixture);
    if (list === 'accept' && error !== undefined) {
      throw new TypeError(
        `${path}[${String(index)}]: the schema rejects this fixture`,
        { cause: error },
      );
    }
    if (list === 'reject' && error === undefined) {
      throw new TypeError(
        `${path}[${String(index)}]: the schema accepts this fixture`,
      );
    }
  }
  return Object.freeze([...values]);
}

/**
 * Declares a validator for a definer's `validators`, returned frozen.
 * Throws `TypeError` when either fixture list is empty, when the schema
 * rejects an `accept` fixture or accepts a `reject` fixture (naming the
 * list and index), or when the schema parses asynchronously.
 */
export function defineValidator<TSchema extends $ZodType>(
  init: ValidatorInit<TSchema>,
): Validator<TSchema> {
  const value = expectRecord(DEFINE_VALIDATOR, init);
  expectKnownKeys(DEFINE_VALIDATOR, value, VALIDATOR_KEYS);
  const schema = expectSchema(`${DEFINE_VALIDATOR}.schema`, value['schema']);
  const fixtures = expectRecord(
    `${DEFINE_VALIDATOR}.fixtures`,
    value['fixtures'],
  );
  expectKnownKeys(`${DEFINE_VALIDATOR}.fixtures`, fixtures, FIXTURE_KEYS);
  const validator = Object.freeze({
    schema,
    fixtures: Object.freeze({
      accept: checkList(schema, fixtures, 'accept'),
      reject: checkList(schema, fixtures, 'reject'),
    }),
    description: optionalString(
      `${DEFINE_VALIDATOR}.description`,
      value['description'],
    ),
  });
  VALIDATORS.add(validator);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the value is the checked init, frozen; its literal types are the caller's, and the mark is type-only (`types.ts`)
  return validator as unknown as Validator<TSchema>;
}
