/**
 * The values `defineCodec` and `defineValidator` return (SPEC 7). Each
 * carries a type-only mark, so an object written by hand fails `tsc` where
 * a registry expects one, as it fails the runtime brand check
 * (`isCodec`, `isValidator`).
 * @packageDocumentation
 */
import type { $ZodType, input } from 'zod/v4/core';

/** A list with at least one member. */
export type NonEmptyList<TValue> = readonly [TValue, ...Array<TValue>];

/** Type-only: the mark of a value `defineCodec` returned. */
declare const madeByDefineCodec: unique symbol;

/** Type-only: the mark of a value `defineValidator` returned. */
declare const madeByDefineValidator: unique symbol;

/**
 * The public facet of a value type (SPEC 7.1): the catalog types it
 * attaches to, the schema of its wire value, and the wire values
 * `pg-catalog rules --check` round-trips through the database.
 */
export interface Codec<
  TTypes extends ReadonlyArray<string> = ReadonlyArray<string>,
  TSchema extends $ZodType = $ZodType,
> {
  /** Type reference names: base types, enums, domains, and `<type>[]`. */
  readonly types: TTypes;
  /** What the wire carries. */
  readonly schema: TSchema;
  /** Wire values the schema accepts. */
  readonly fixtures: NonEmptyList<input<TSchema>>;
  readonly description: string | undefined;
  readonly [madeByDefineCodec]: true;
}

/**
 * The request-side twin of a CHECK the recognizer could not translate
 * (SPEC 7.2): a schema over the field's value, or over an object of the
 * CHECK's fields by public name, and values it must accept and reject.
 */
export interface Validator<TSchema extends $ZodType = $ZodType> {
  readonly schema: TSchema;
  readonly fixtures: ValidatorFixtures<TSchema>;
  readonly description: string | undefined;
  readonly [madeByDefineValidator]: true;
}

/** Values a validator must accept and values it must reject, each list non-empty. */
interface ValidatorFixtures<TSchema extends $ZodType = $ZodType> {
  readonly accept: NonEmptyList<input<TSchema>>;
  readonly reject: NonEmptyList<input<TSchema>>;
}
