/**
 * Collisions in an inverted map (SPEC 4.2): a mapped type whose `as`
 * clause remaps each key to its public name merges the keys that share a
 * name into one property whose type is their union, so a property with two
 * or more members is a collision. One pass over the properties finds them
 * all; looking each key up in the map instead recomputes its key set per
 * lookup, which measured quadratic on GitLab's tables.
 * @ref https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as
 * @packageDocumentation
 */

/** The members of `TOwners` when it has two or more, else `never`. */
type Colliding<TOwners, TAll = TOwners> = TOwners extends unknown
  ? [Exclude<TAll, TOwners>] extends [never]
    ? never
    : TOwners
  : never;

/** The keys of an inverted map's owners that share their name with another. */
export type CollidingOwners<TOwnersByName> = {
  [N in keyof TOwnersByName]: Colliding<TOwnersByName[N]>;
}[keyof TOwnersByName];

/**
 * The keys an inverted map lists under `TName`, or `never`: TypeScript
 * cannot index a remapped mapped type with a generic key directly.
 */
export type OwnersOf<TOwnersByName, TName> = TName extends keyof TOwnersByName
  ? TOwnersByName[TName]
  : never;
