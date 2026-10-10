import type { StorageCodec, StorageCodecs } from './storage-codecs';

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineCodec } from './define-codec';

const codecs = {
  money: defineCodec({
    types: ['money'],
    schema: z.string().regex(/^-?[0-9]+\.[0-9]{2}$/u),
    fixtures: ['12.50'],
  }),
  count: defineCodec({
    types: ['int4range'],
    schema: z.string().transform(Number),
    fixtures: ['3'],
  }),
};

describe('StorageCodecs (SPEC 7.1)', () => {
  it('has one storage facet per codec, over the parsed wire value', () => {
    type Storage = StorageCodecs<typeof codecs, string>;
    expectTypeOf<keyof Storage>().toEqualTypeOf<'money' | 'count'>();
    expectTypeOf<Storage['money']>().toEqualTypeOf<
      StorageCodec<string, string>
    >();
    expectTypeOf<Storage['count']['read']>().returns.toEqualTypeOf<number>();
    expectTypeOf<Storage['count']['write']>()
      .parameter(0)
      .toEqualTypeOf<number>();
  });

  it('refuses a missing or an extra facet', () => {
    const facet: StorageCodec<string, string> = {
      read: (stored) => stored,
      write: (value) => value,
    };
    // @ts-expect-error count has no storage facet
    const missing: StorageCodecs<typeof codecs, string> = { money: facet };
    const extra: StorageCodecs<typeof codecs, string> = {
      money: facet,
      count: { read: Number, write: String },
      // @ts-expect-error vector is not a codec
      vector: facet,
    };
    expectTypeOf(missing).not.toBeAny();
    expectTypeOf(extra).not.toBeAny();
  });
});
