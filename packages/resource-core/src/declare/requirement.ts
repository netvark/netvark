/**
 * How the type-level checks report a mistake (SPEC 3). `declareResource`
 * takes `TDecl & DeclarationCheck<...>`; a check adds nothing for a valid
 * part and a `Requirement` for an invalid one, whose key is the message
 * TypeScript prints ("Property '<message>' is missing"). A check never
 * narrows a member's own type: intersecting two different literals gives
 * `never`, which TypeScript propagates to the whole object (discriminant
 * reduction) and which would erase the message.
 * @ref https://devblogs.microsoft.com/typescript/announcing-typescript-3-9/#intersections-reduced-by-discriminant-properties
 * @packageDocumentation
 */

/** A property no value has: its key is the message TypeScript prints when it is missing. */
export type Requirement<TMessage extends string> = {
  readonly [K in TMessage]: never;
};

/** `Requirement<TMessage>` when `TFailed` is true. */
export type RequireWhen<
  TFailed extends boolean,
  TMessage extends string,
> = TFailed extends true ? Requirement<TMessage> : unknown;

/**
 * A requirement on each member of `TValue` outside `TKnown`, reported at
 * that member. A value whose members are all known gets `unknown` without
 * building the mapped type: a mapped type on every field made the checker
 * about six times slower and five times larger on real catalogs (stern's
 * 111 declarations: 1.55 s and 874 MB with the mapped type; see the
 * package README's performance notes).
 */
export type KnownMembers<
  TValue,
  TKnown extends string,
  TWhat extends string,
> = keyof TValue extends TKnown
  ? unknown
  : {
      readonly [
        K in Exclude<keyof TValue, TKnown>
      ]: Requirement<`"${K & string}" is not a member of ${TWhat}`>;
    };

/** `{ [TKey]: TCheck }` when the check requires something, so the error is reported at that member. */
export type AtMember<TKey extends string, TCheck> = unknown extends TCheck
  ? unknown
  : { readonly [K in TKey]: TCheck };
