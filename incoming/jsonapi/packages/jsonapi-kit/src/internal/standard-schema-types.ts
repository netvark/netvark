/**
 * Structural copy of the Standard Schema V1 interface. Vendored so the root
 * declaration file never depends on `@standard-schema/spec` being installed.
 * Any object that satisfies the published interface satisfies this one, so a
 * Zod 4, Valibot, ArkType, or Effect schema is accepted as a validator without
 * this package importing any of them.
 * @ref https://standardschema.dev
 * @ref https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts
 * @packageDocumentation
 */

export interface StandardSchemaPathSegment {
  readonly key: PropertyKey;
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?:
    | ReadonlyArray<PropertyKey | StandardSchemaPathSegment>
    | undefined;
}

export interface StandardSchemaSuccess<TOutput> {
  readonly value: TOutput;
  readonly issues?: undefined;
}

export interface StandardSchemaFailure {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

export type StandardSchemaResult<TOutput> =
  | StandardSchemaSuccess<TOutput>
  | StandardSchemaFailure;

interface StandardSchemaTypes<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
}

export interface StandardSchemaOptions {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

export interface StandardSchemaProps<TInput, TOutput> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
    options?: StandardSchemaOptions,
  ) => StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>;
  readonly types?: StandardSchemaTypes<TInput, TOutput> | undefined;
}

export interface StandardSchema<TInput = unknown, TOutput = TInput> {
  readonly '~standard': StandardSchemaProps<TInput, TOutput>;
}

export type InferStandardOutput<TSchema extends StandardSchema> = NonNullable<
  TSchema['~standard']['types']
>['output'];

export type InferStandardInput<TSchema extends StandardSchema> = NonNullable<
  TSchema['~standard']['types']
>['input'];
