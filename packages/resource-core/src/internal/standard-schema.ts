/**
 * A structural copy of the Standard Schema V1 interface, vendored as
 * `@netvark/jsonapi-core` and `@netvark/ban-core` vendor theirs, so the
 * declaration files never depend on `@standard-schema/spec`. Any object that
 * satisfies this interface satisfies the published one.
 * @ref https://standardschema.dev
 * @ref https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts
 * @packageDocumentation
 */

/** A successful result: the output, and no issues. */
interface StandardSuccess<TOutput> {
  readonly value: TOutput;
  readonly issues?: undefined;
}

/** A failed result: the issues. */
interface StandardFailure<TIssue> {
  readonly issues: ReadonlyArray<TIssue>;
}

/** The input and output types, carried for inference only. */
interface StandardTypes<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
}

/** A Standard Schema V1 whose `validate` is synchronous and whose issues are `TIssue`. */
export interface SyncStandardSchema<TInput, TOutput, TIssue> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSuccess<TOutput> | StandardFailure<TIssue>;
    readonly types?: StandardTypes<TInput, TOutput> | undefined;
  };
}
