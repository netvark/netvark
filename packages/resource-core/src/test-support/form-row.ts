/**
 * One case per row of SPEC 5.1, shared by the wire-form tests: the values a
 * form accepts and those it refuses, with the issue each refusal reports.
 * The PostgreSQL behavior behind each refusal was captured on PostgreSQL
 * 14.19 and 18.3; the oracle in `e2e/resource` runs the same values through
 * both servers and PGlite. Not published with the package.
 * @packageDocumentation
 */
import type { TypeRecord } from '../schema/value-form';

import { describe, expect, it } from 'vitest';

import { issuesOf, wireSchema } from './forms';

type Row = Partial<TypeRecord> & Pick<TypeRecord, 'type'>;
type Refusal = readonly [value: unknown, code: string, expected?: string];

/** Declares the tests of one wire form: each accepted value, and each refused one with its issue. */
export function formRow(
  record: Row,
  accepts: ReadonlyArray<unknown>,
  refuses: ReadonlyArray<Refusal>,
  integer = false,
): void {
  const schema = wireSchema(record);
  const label = [record.type, record.maxLength, record.precision, record.scale]
    .filter((part) => part !== undefined && part !== null)
    .join(' ');
  describe(label, () => {
    it.each(accepts.map((value) => [value]))('accepts %j', (value) => {
      expect(issuesOf(schema, value, integer)).toEqual([]);
    });
    it.each(refuses)('refuses %j as %s %s', (value, code, expected) => {
      expect(issuesOf(schema, value, integer)).toEqual([
        expected === undefined
          ? { code, path: [] }
          : { code, expected, path: [] },
      ]);
    });
  });
}
