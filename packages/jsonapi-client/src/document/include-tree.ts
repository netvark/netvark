/**
 * The include paths a request sent, as a tree (SPEC 15.6): the names a
 * record resolves, each leading to the names its related records resolve.
 * `author.articles` resolves `author` too, since a compound document holds
 * every resource on the path.
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */

/** By relationship name, the names below it. */
export type IncludeTree = ReadonlyMap<string, IncludeTree>;

type Branches = Map<string, Branches>;

/** The tree of no include paths: every relationship is linkage. */
export const NO_INCLUDES: IncludeTree = new Map();

export function includeTree(paths: ReadonlyArray<string>): IncludeTree {
  const root: Branches = new Map();
  for (const path of paths) {
    let level = root;
    for (const name of path.split('.')) {
      let next = level.get(name);
      if (next === undefined) {
        next = new Map();
        level.set(name, next);
      }
      level = next;
    }
  }
  return root;
}
