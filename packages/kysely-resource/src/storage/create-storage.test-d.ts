import type { Generated, Kysely } from 'kysely';

import type { StorageCodecs } from '@netvark/resource-core';
import type { ScopeValue } from '@netvark/resource-core/server';
import type {
  ContractCodecs,
  TextStorageCodec,
} from '@netvark/resource-core/testing';

import type { KyselyTransaction } from './transaction';
import type { KyselyStorage, KyselyStorageOptions, TextCodec } from './types';

import { sql } from 'kysely';
import { describe, expectTypeOf, it } from 'vitest';

import { createKyselyStorage } from './create-storage';

declare const storage: KyselyStorage;

interface Database {
  readonly people: { readonly id: Generated<number>; readonly name: string };
}

describe('createKyselyStorage (SPEC 18.2)', () => {
  it("takes the application's Kysely, whatever its database type", () => {
    expectTypeOf(createKyselyStorage<Database>)
      .parameter(0)
      .toHaveProperty('db')
      .toEqualTypeOf<Kysely<Database>>();
    expectTypeOf(
      createKyselyStorage<Database>,
    ).returns.toEqualTypeOf<KyselyStorage>();
  });

  it('takes the storage codec of any codec, as rules --check does', () => {
    expectTypeOf<StorageCodecs<ContractCodecs, string>>().toExtend<
      NonNullable<KyselyStorageOptions<Database>['codecs']>
    >();
    expectTypeOf<TextCodec>().toEqualTypeOf<TextStorageCodec>();
  });

  it('resolves a transaction to what its run resolves to, and a statement to its rows', () => {
    expectTypeOf(
      storage.transaction([], async (tx) =>
        tx.execute((db) => sql<{ id: string }>`select '1' as "id"`.compile(db)),
      ),
    ).resolves.toEqualTypeOf<ReadonlyArray<{ id: string }>>();
  });

  it('takes no transaction it did not open', () => {
    expectTypeOf<{
      readonly scopes: ReadonlyArray<ScopeValue>;
      readonly execute: KyselyTransaction['execute'];
    }>().not.toExtend<KyselyTransaction>();
  });
});
