/**
 * The seeded source of the generated catalogs (SPEC 15.2): mulberry32, a
 * 32-bit generator a few lines long, so the property test adds no
 * dependency and a seed rebuilds its catalog exactly.
 * @ref https://gist.github.com/tommyettinger/46a874533244883189143505d203312c (mulberry32)
 * Not published with the package.
 * @packageDocumentation
 */

/** Draws from one seeded sequence. */
export interface Random {
  /** An integer in `[min, max]`. */
  readonly int: (min: number, max: number) => number;
  /** True with probability `p`. */
  readonly chance: (p: number) => boolean;
  /** One element of a non-empty list. */
  readonly pick: <T>(list: ReadonlyArray<T>) => T;
  /** The elements of `list`, each kept with probability `p`, in order. */
  readonly subset: <T>(list: ReadonlyArray<T>, p?: number) => Array<T>;
}

/** mulberry32's increment; its shifts and odd constants stay inline as published. */
const INCREMENT = 0x6d_2b_79_f5;
const UINT32_RANGE = 2 ** 32;
const HALF = 0.5;

/** The draws of the sequence `seed` starts, its low 32 bits. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)]!,
    subset: (list, p = HALF) => list.filter(() => next() < p),
  };
}
