/**
 * `defineEvent(name, version, schema)` (SPEC 12.7): a domain event the
 * effects of an operation return. `of(payload)` validates the payload with
 * the event's Standard Schema and returns `{ name, version, payload }`,
 * frozen. The adapter writes the events to an outbox in the operation's
 * transaction, so they commit or roll back with the write (SPEC 12.8), and
 * delivery after commit belongs to the runtime. Consumers tell payload
 * shapes apart by version, so a changed payload is a new version.
 * @ref https://standardschema.dev
 * @packageDocumentation
 */
import type {
  StandardInput,
  StandardOutput,
  StandardSchema,
} from '../internal/standard-schema';

import { isRecord } from '../internal/object';

/** An event an effect returns, as the outbox records it. */
export interface DomainEvent<
  TName extends string = string,
  TVersion extends number = number,
  TPayload = unknown,
> {
  readonly name: TName;
  readonly version: TVersion;
  readonly payload: TPayload;
}

/** A declared event: its name, version, and payload schema, and `of` to make one. */
export interface EventDefinition<
  TName extends string = string,
  TVersion extends number = number,
  TSchema extends StandardSchema = StandardSchema,
> {
  readonly name: TName;
  readonly version: TVersion;
  readonly schema: TSchema;
  /**
   * The event of `payload`, validated by the schema. Throws `TypeError`
   * when the payload does not match, with the issues as the cause, or when
   * the schema validates asynchronously.
   */
  readonly of: (
    payload: StandardInput<TSchema>,
  ) => DomainEvent<TName, TVersion, StandardOutput<TSchema>>;
}

/** Letters and digits in segments joined by `.`, `_`, or `-`, such as `contact.created`. */
const NAME = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u;

function isStandardSchema(value: unknown): value is StandardSchema {
  const standard = isRecord(value) ? value['~standard'] : undefined;
  return isRecord(standard) && typeof standard['validate'] === 'function';
}

function checkEvent(name: unknown, version: unknown, schema: unknown): void {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new TypeError(
      'defineEvent: the name must be letters and digits in segments joined by ".", "_", or "-"',
    );
  }
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new TypeError(
      `defineEvent: ${name}: the version must be a positive integer`,
    );
  }
  if (!isStandardSchema(schema)) {
    throw new TypeError(
      `defineEvent: ${name}: the schema must be a Standard Schema`,
    );
  }
}

/** A declared event, frozen; throws `TypeError` for a name, version, or schema JavaScript got wrong. */
export function defineEvent<
  const TName extends string,
  const TVersion extends number,
  TSchema extends StandardSchema,
>(
  name: TName,
  version: TVersion,
  schema: TSchema,
): EventDefinition<TName, TVersion, TSchema> {
  checkEvent(name, version, schema);
  const label = `${name} v${String(version)}`;
  return Object.freeze({
    name,
    version,
    schema,
    of: (payload: StandardInput<TSchema>) => {
      const result = schema['~standard'].validate(payload);
      if ('then' in result) {
        throw new TypeError(
          `${label}: of() needs a schema that validates synchronously`,
        );
      }
      if (result.issues !== undefined) {
        throw new TypeError(
          `${label}: the payload does not match the event's schema`,
          {
            cause: result.issues,
          },
        );
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: a successful Standard Schema result's value is the schema's output, which StandardOutput reads from the same schema
      const value = result.value as StandardOutput<TSchema>;
      return Object.freeze({ name, version, payload: value });
    },
  });
}
