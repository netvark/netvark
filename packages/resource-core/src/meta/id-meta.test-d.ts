/**
 * The compile-time twin of `id-meta.test.ts` (SPEC 3.4, 8): a relationship
 * to a `bool` key types its options as the two texts its id takes, and a
 * relationship to an enum key as the enum's labels.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';

const COLUMN = {
  typeKind: 'base',
  array: false,
  maxLength: null,
  precision: null,
  scale: null,
  nullable: false,
  default: null,
  identity: null,
  generated: null,
} as const;

const declareResource = createDeclareResource({
  catalog: {
    format: 3,
    enums: { mood: ['calm', 'tense'] },
    domains: {},
    tables: {
      flags: {
        schema: 'public',
        name: 'flags',
        primaryKey: ['id'],
        columns: { id: { ...COLUMN, type: 'bool', sqlType: 'boolean' } },
        constraints: { flags_pkey: { kind: 'primaryKey', columns: ['id'] } },
      },
      moods: {
        schema: 'public',
        name: 'moods',
        primaryKey: ['id'],
        columns: {
          id: { ...COLUMN, type: 'mood', typeKind: 'enum', sqlType: 'mood' },
        },
        constraints: { moods_pkey: { kind: 'primaryKey', columns: ['id'] } },
      },
      toggles: {
        schema: 'public',
        name: 'toggles',
        primaryKey: ['id'],
        columns: {
          id: { ...COLUMN, type: 'uuid', sqlType: 'uuid' },
          flag_id: { ...COLUMN, type: 'bool', sqlType: 'boolean' },
          mood_id: {
            ...COLUMN,
            type: 'mood',
            typeKind: 'enum',
            sqlType: 'mood',
          },
        },
        constraints: {
          toggles_pkey: { kind: 'primaryKey', columns: ['id'] },
          toggles_flag_id_fkey: {
            kind: 'foreignKey',
            columns: ['flag_id'],
            references: { table: 'flags', columns: ['id'] },
            enforced: true,
          },
          toggles_mood_id_fkey: {
            kind: 'foreignKey',
            columns: ['mood_id'],
            references: { table: 'moods', columns: ['id'] },
            enforced: true,
          },
        },
      },
    },
  },
});

const Flags = declareResource('flags', { operations: ['get'], fields: {} });
const Moods = declareResource('moods', { operations: ['get'], fields: {} });

const Toggles = declareResource('toggles', {
  operations: ['update'],
  fields: {},
  relationships: {
    flag_id: { target: () => Flags, access: 'readWrite' },
    mood_id: { target: () => Moods, access: 'readWrite' },
  },
});

describe('relationship ids in types (SPEC 3.4, 8)', () => {
  it("types a bool key's id options and an enum key's labels", () => {
    expectTypeOf(Toggles.fields.flag.options).toEqualTypeOf<
      ReadonlyArray<'true' | 'false'>
    >();
    expectTypeOf(Toggles.fields.mood.options).toEqualTypeOf<
      ReadonlyArray<'calm' | 'tense'>
    >();
    expectTypeOf(Toggles.fields.flag.target).toEqualTypeOf<'flags'>();
    expectTypeOf(Toggles.fields.flag.items).toEqualTypeOf<null>();
  });
});
