/**
 * Defects of reading rows the storage contract must catch (resource SPEC
 * 12.8, obligation 3), for `contract-faults.ts`: a `numeric` read as a
 * number, which loses digits; the elements of a boolean array read as
 * words, though PostgreSQL prints them as `t` and `f`; a `write` field
 * returned; and a value without a read form, `infinity`, read as `null`.
 * @ref https://www.postgresql.org/docs/18/datatype-boolean.html ("The datatype output function for type boolean always emits either t or f")
 */
import type { Fault } from './contract-faults.ts';

import { rewriting, wrapping } from './faulty-adapters.ts';

const STARTS_AT = '"starts_at"::text as "startsAt"';

const O3_FORMS =
  'obligation 3: reads every field in its read form, a codec field through its storage codec, and no write field';

/** The defects of obligation 3, each with the cases that must fail. */
export const READ_FAULTS: ReadonlyArray<Fault> = [
  {
    name: 'reads a numeric as a number',
    fails: [O3_FORMS],
    adapter: wrapping((adapter) => ({
      ...adapter,
      create: async (tx, resource, input) => {
        const row = await adapter.create(tx, resource, input);
        return { ...row, estimate: Number(row['estimate']) };
      },
    })),
  },
  {
    // PostgreSQL prints a boolean array's elements as t and f, which a
    // reader that compares them with the word true reads as false.
    name: 'reads every element of a boolean array as false',
    fails: [O3_FORMS],
    adapter: wrapping((adapter) => ({
      ...adapter,
      create: async (tx, resource, input) => {
        const row = await adapter.create(tx, resource, input);
        const checklist = row['checklist'];
        return Array.isArray(checklist)
          ? { ...row, checklist: checklist.map(() => false) }
          : row;
      },
    })),
  },
  {
    name: 'returns a write field',
    fails: [O3_FORMS],
    adapter: wrapping((adapter) => ({
      ...adapter,
      create: async (tx, resource, input) => ({
        ...(await adapter.create(tx, resource, input)),
        secret: input.attributes['secret'] ?? null,
      }),
    })),
  },
  {
    name: 'reads infinity as null',
    fails: ['obligation 3: fails a read whose stored value has no read form'],
    adapter: rewriting((sql) =>
      sql.replace(
        STARTS_AT,
        `nullif("starts_at", 'infinity')::text as "startsAt"`,
      ),
    ),
  },
];
