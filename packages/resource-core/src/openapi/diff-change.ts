/**
 * The change records of `diffSurfaces` (SPEC 13.2) and the comparisons
 * every part of a surface shares: keyed entries, sets of names, flags, and
 * values whose any change breaks a client.
 * @packageDocumentation
 */

/** One difference between two surfaces. */
export interface SurfaceChange {
  /** The type, then the keys down to what changed: `['contacts', 'fields', 'email', 'nullable']`. */
  readonly path: ReadonlyArray<string>;
  /** An entry or a set member added or removed, or a value changed. */
  readonly change: 'added' | 'removed' | 'changed';
  /** Whether a client written against the surface before may fail against the one after. */
  readonly breaking: boolean;
  /** The value before; `null` for an addition. */
  readonly before: unknown;
  /** The value after; `null` for a removal. */
  readonly after: unknown;
}

export type Path = ReadonlyArray<string>;

export function changed(
  path: Path,
  breaking: boolean,
  before: unknown,
  after: unknown,
): ReadonlyArray<SurfaceChange> {
  return [{ path, change: 'changed', breaking, before, after }];
}

/** A change of a value any change of which breaks a client: a wire type, a format, a codec, a target, a status. */
export function diffEqual(
  path: Path,
  before: unknown,
  after: unknown,
): ReadonlyArray<SurfaceChange> {
  return before === after ? [] : changed(path, true, before, after);
}

/** A capability flag: losing it breaks a client, gaining it does not. */
export function diffFlag(
  path: Path,
  before: boolean,
  after: boolean,
): ReadonlyArray<SurfaceChange> {
  return before === after ? [] : changed(path, before, before, after);
}

/** The members of a set added and removed, each by name, in order; `breaking` says which direction breaks. */
export function diffSet(
  path: Path,
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  breaking: { readonly added: boolean; readonly removed: boolean },
): ReadonlyArray<SurfaceChange> {
  const kept = new Set(after);
  const had = new Set(before);
  return [
    ...before
      .filter((name) => !kept.has(name))
      .map((name) => ({
        path: [...path, name],
        change: 'removed' as const,
        breaking: breaking.removed,
        before: name,
        after: null,
      })),
    ...after
      .filter((name) => !had.has(name))
      .map((name) => ({
        path: [...path, name],
        change: 'added' as const,
        breaking: breaking.added,
        before: null,
        after: name,
      })),
  ];
}

/**
 * The entries of a keyed part, in key order: a removal breaks a client, an
 * addition breaks one when `addedBreaks` says so, and `both` compares an
 * entry present on both sides.
 */
export function diffKeyed<TValue>(
  path: Path,
  before: Readonly<Record<string, TValue>>,
  after: Readonly<Record<string, TValue>>,
  addedBreaks: (value: TValue) => boolean,
  both: (
    path: Path,
    before: TValue,
    after: TValue,
  ) => ReadonlyArray<SurfaceChange>,
): ReadonlyArray<SurfaceChange> {
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].toSorted();
  return keys.flatMap((key): ReadonlyArray<SurfaceChange> => {
    const entryPath = [...path, key];
    const old = Object.hasOwn(before, key) ? before[key] : undefined;
    const now = Object.hasOwn(after, key) ? after[key] : undefined;
    if (now === undefined) {
      return [
        {
          path: entryPath,
          change: 'removed',
          breaking: true,
          before: old,
          after: null,
        },
      ];
    }
    if (old === undefined) {
      return [
        {
          path: entryPath,
          change: 'added',
          breaking: addedBreaks(now),
          before: null,
          after: now,
        },
      ];
    }
    return both(entryPath, old, now);
  });
}
