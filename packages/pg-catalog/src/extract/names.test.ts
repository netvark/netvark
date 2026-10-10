import { describe, expect, it } from 'vitest';

import { PgCatalogError } from '../errors';
import {
  assertSafeKey,
  orderedRecord,
  referenceName,
  sortedRecord,
} from './names';

describe('referenceName (SPEC 2.1)', () => {
  it('is bare in the default schema and in pg_catalog, qualified elsewhere', () => {
    expect(referenceName('public', 'contacts', 'public')).toBe('contacts');
    expect(referenceName('pg_catalog', 'int4', 'public')).toBe('int4');
    expect(referenceName('audit', 'events', 'public')).toBe('audit.events');
    expect(referenceName('public', 'contacts', 'app')).toBe('public.contacts');
  });

  it('keeps names exactly as PostgreSQL stores them: no case folding, no quoting', () => {
    expect(referenceName('public', 'Order Lines', 'public')).toBe(
      'Order Lines',
    );
    expect(referenceName('Audit', 'a.b', 'public')).toBe('Audit.a.b');
  });
});

describe('keys of the generated literals (SPEC 2.1, 2.10)', () => {
  it('rejects __proto__ with unsafe_name', () => {
    expect(() => {
      assertSafeKey('__proto__', 'column', 'table contacts');
    }).toThrow(
      expect.objectContaining({
        code: 'unsafe_name',
        message:
          'the column "__proto__" of table contacts cannot be a key of the generated catalog; rename it',
      }),
    );
    expect(() => {
      sortedRecord([['__proto__', 1]], 'table');
    }).toThrow(PgCatalogError);
  });

  it('accepts other names that look special, which object literals store as members', () => {
    expect(
      Object.keys(
        sortedRecord(
          [
            ['constructor', 1],
            ['toString', 2],
            ['proto', 3],
          ],
          'column',
        ),
      ),
    ).toEqual(['constructor', 'proto', 'toString']);
  });

  it('rejects two objects with the same key with duplicate_key', () => {
    expect(() =>
      sortedRecord(
        [
          ['a.b', 1],
          ['a.b', 2],
        ],
        'table',
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'duplicate_key',
        message: 'two objects map to the table key "a.b"',
      }),
    );
  });

  it('sorts by UTF-16 code units, never by collation', () => {
    expect(
      Object.keys(
        sortedRecord(
          [
            ['b', 0],
            ['B', 0],
            ['é', 0],
            ['a', 0],
            ['_x', 0],
          ],
          'table',
        ),
      ),
    ).toEqual(['B', '_x', 'a', 'b', 'é']);
  });

  it('keeps the given order for columns, except that JavaScript lists integer-like keys first', () => {
    expect(
      Object.keys(
        orderedRecord(
          [
            ['z', 0],
            ['a', 0],
            ['2024', 0],
          ],
          'column',
        ),
      ),
    ).toEqual(['2024', 'z', 'a']);
  });
});
