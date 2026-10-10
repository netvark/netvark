/**
 * A value computed on first use and kept: what a declared resource's
 * schemas are, since building them costs more than declaring and reading a
 * relationship's target must wait until every module has loaded (SPEC 3.8).
 * @packageDocumentation
 */

/** Returns `build()`'s value, calling `build` once, on the first call. */
export function lazy<TValue>(build: () => TValue): () => TValue {
  let cell: { readonly value: TValue } | undefined;
  return () => {
    cell ??= { value: build() };
    return cell.value;
  };
}
