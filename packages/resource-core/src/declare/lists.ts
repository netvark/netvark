/**
 * Literal lists in the type-level checks (SPEC 3): a declaration's
 * operations, a member's operators, and the fields of its default sort are
 * each listed once, as the runtime checks.
 * @packageDocumentation
 */

/** Whether a literal tuple lists an element twice; read in tail position. */
export type HasRepeat<
  TList extends ReadonlyArray<unknown>,
  TSeen = never,
> = TList extends readonly [infer THead, ...infer TRest]
  ? [THead] extends [TSeen]
    ? true
    : HasRepeat<TRest, TSeen | THead>
  : false;
