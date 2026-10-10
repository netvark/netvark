/**
 * The storage facet of the codecs (SPEC 7.1): what a storage adapter
 * implements for each codec of a definer, converting between the codec's
 * parsed wire value and what the driver reads and writes. Keyed by the
 * same names as the codecs, so the two facets cannot disagree on the set.
 * @packageDocumentation
 */
import type { output } from 'zod/v4/core';

import type { CodecRegistry } from '../declare/registries';

/** One codec's storage facet: `TValue` is the parsed wire value, `TStored` the driver's. */
export interface StorageCodec<TValue, TStored> {
  /** The wire value of a value the driver read. */
  readonly read: (stored: TStored) => TValue;
  /** The value the driver writes for a wire value. */
  readonly write: (value: TValue) => TStored;
}

/** The storage facet of every codec in `TCodecs`, by the same names. */
export type StorageCodecs<TCodecs extends CodecRegistry, TStored = unknown> = {
  readonly [K in keyof TCodecs]: StorageCodec<
    output<TCodecs[K]['schema']>,
    TStored
  >;
};
