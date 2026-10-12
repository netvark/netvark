/**
 * The cache of `Intl` objects (SPEC 3.4, ADR 0003). Building an
 * `Intl.DateTimeFormat` costs 43 to 54 µs and reusing one about 1 µs, so
 * each `createIntl()` result keeps the objects it builds, keyed by the
 * constructor's name, the formatting tag, and the options, and drops the
 * least recently used one when it is full. Each constructor has its own
 * typed store; one recency order across the stores holds the bound.
 * @packageDocumentation
 */

/** Makes, or takes from the cache, the object for a tag and options. */
type IntlGetter<TOptions extends object, TIntl extends object> = (
  tag: string,
  options: TOptions,
) => TIntl;

export interface IntlCache {
  /**
   * The getter of the objects `build` makes for the constructor `name`.
   * The getter hands `build` an own copy of the options, so the
   * constructor reads exactly the entries the key is made of, each read
   * once. Every option value must be a string, a number other than NaN,
   * or a boolean for the object to be cached; any other value builds an
   * object for that call only, rather than risk two option sets sharing a
   * key.
   */
  readonly getter: <TOptions extends object, TIntl extends object>(
    name: string,
    build: (tag: string, options: TOptions) => TIntl,
  ) => IntlGetter<TOptions, TIntl>;
}

interface Store {
  delete(key: string): boolean;
}

/** A cache that never holds more than `size` objects across its getters. */
export function createIntlCache(size: number): IntlCache {
  // Every cached key, least recently used first, with the store holding it.
  const recency = new Map<string, Store>();

  function remember(key: string, store: Store): void {
    recency.delete(key);
    recency.set(key, store);
  }

  function evictOldest(): void {
    const oldest = recency.entries().next();
    if (oldest.done !== true) {
      const [key, store] = oldest.value;
      recency.delete(key);
      store.delete(key);
    }
  }

  return {
    getter: <TOptions extends object, TIntl extends object>(
      name: string,
      build: (tag: string, options: TOptions) => TIntl,
    ): IntlGetter<TOptions, TIntl> => {
      const store = new Map<string, TIntl>();
      return (tag, options) => {
        const copy = { ...options };
        const key = cacheKey(name, tag, copy);
        if (key === undefined) {
          return build(tag, copy);
        }
        const cached = store.get(key);
        if (cached !== undefined) {
          remember(key, store);
          return cached;
        }
        const built = build(tag, copy);
        if (recency.size >= size) {
          evictOldest();
        }
        store.set(key, built);
        remember(key, store);
        return built;
      };
    },
  };
}

/**
 * The key of `name`, `tag`, and the options: their own enumerable entries
 * whose value is not `undefined`, sorted by name, each value with its
 * type. `undefined` when a value is not a string, a number other than
 * NaN, or a boolean.
 */
export function cacheKey(
  name: string,
  tag: string,
  options: object,
): string | undefined {
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .toSorted(([left], [right]) => (left < right ? -1 : 1));
  const parts: Array<string> = [name, tag];
  for (const [option, value] of entries) {
    if (!isKeyValue(value)) {
      return undefined;
    }
    parts.push(option, typeof value, String(value));
  }
  return JSON.stringify(parts);
}

function isKeyValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && !Number.isNaN(value))
  );
}
