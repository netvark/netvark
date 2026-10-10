import { describe, expect, it } from 'vitest';

import { isPgCatalogError } from '../errors';
import { naturalCompare, orderMigrations } from './order';

function failure(names: ReadonlyArray<string>): {
  code: string;
  message: string;
} {
  try {
    orderMigrations(names);
  } catch (error) {
    if (isPgCatalogError(error)) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error('expected a failure');
}

describe('orderMigrations: Flyway naming (SPEC 5)', () => {
  it('orders versioned files by version, compared group by group as numbers', () => {
    expect(
      orderMigrations([
        'V10__ten.sql',
        'V2__two.sql',
        'V1_1__one_one.sql',
        'V1__one.sql',
        'V1.2__x.sql',
      ]),
    ).toEqual([
      'V1__one.sql',
      'V1_1__one_one.sql',
      'V1.2__x.sql',
      'V2__two.sql',
      'V10__ten.sql',
    ]);
  });

  it('runs repeatable files after every versioned file, ordered by description', () => {
    expect(
      orderMigrations([
        'R__views.sql',
        'V2__b.sql',
        'R__functions.sql',
        'V1__a.sql',
      ]),
    ).toEqual(['V1__a.sql', 'V2__b.sql', 'R__functions.sql', 'R__views.sql']);
  });

  it('never runs undo files', () => {
    expect(orderMigrations(['V1__a.sql', 'U1__a.sql', 'V2__b.sql'])).toEqual([
      'V1__a.sql',
      'V2__b.sql',
    ]);
  });

  it('orders by version across directories, since Flyway scans recursively', () => {
    expect(
      orderMigrations(['b/V1__a.sql', 'a/V2__b.sql', 'V3__c.sql']),
    ).toEqual(['b/V1__a.sql', 'a/V2__b.sql', 'V3__c.sql']);
  });

  it('rejects two files with the same version, however it is spelled', () => {
    expect(failure(['V1_1__a.sql', 'V1.1__b.sql'])).toEqual({
      code: 'migrations_invalid',
      message:
        'migrations V1.1__b.sql and V1_1__a.sql have the same Flyway version',
    });
    expect(failure(['V01__a.sql', 'x/V1__b.sql']).code).toBe(
      'migrations_invalid',
    );
  });

  it('rejects two repeatable files with the same description', () => {
    expect(failure(['a/R__views.sql', 'b/R__views.sql']).message).toBe(
      'migrations a/R__views.sql and b/R__views.sql have the same Flyway description',
    );
  });
});

describe('orderMigrations: natural order (SPEC 5)', () => {
  it('orders digit runs as numbers when any file departs from Flyway naming', () => {
    expect(orderMigrations(['10_ten.sql', '2_two.sql', '1_one.sql'])).toEqual([
      '1_one.sql',
      '2_two.sql',
      '10_ten.sql',
    ]);
  });

  it('fits timestamped files (dbmate) and up files (golang-migrate), skipping down files', () => {
    expect(
      orderMigrations([
        '20240102000000_b.sql',
        '000002_users.up.sql',
        '20240101000000_a.sql',
        '000002_users.down.sql',
        '000001_init.up.sql',
      ]),
    ).toEqual([
      '000001_init.up.sql',
      '000002_users.up.sql',
      '20240101000000_a.sql',
      '20240102000000_b.sql',
    ]);
  });

  it('falls back to natural order for a mix, and still skips Flyway undo files', () => {
    expect(
      orderMigrations(['V2__b.sql', 'seed.sql', 'V1__a.sql', 'U1__a.sql']),
    ).toEqual(['V1__a.sql', 'V2__b.sql', 'seed.sql']);
  });

  it('ignores files that are not SQL', () => {
    expect(orderMigrations(['README.md', '1_a.sql', '.keep'])).toEqual([
      '1_a.sql',
    ]);
    expect(orderMigrations([])).toEqual([]);
  });

  it('orders nested paths naturally, directory names included', () => {
    expect(orderMigrations(['10/a.sql', '2/b.sql', '2/a.sql'])).toEqual([
      '2/a.sql',
      '2/b.sql',
      '10/a.sql',
    ]);
  });
});

describe('naturalCompare', () => {
  it('breaks ties between numerically equal names by code units, so the order is total', () => {
    expect(['1_a.sql', '01_a.sql'].toSorted(naturalCompare)).toEqual([
      '01_a.sql',
      '1_a.sql',
    ]);
    expect(naturalCompare('a.sql', 'a.sql')).toBe(0);
  });

  it('compares digit runs beyond Number precision exactly', () => {
    expect(
      ['100000000000000000001_b.sql', '100000000000000000000_a.sql'].toSorted(
        naturalCompare,
      ),
    ).toEqual(['100000000000000000000_a.sql', '100000000000000000001_b.sql']);
  });

  it('orders a name before its extensions', () => {
    expect(['a1b.sql', 'a1.sql'].toSorted(naturalCompare)).toEqual([
      'a1.sql',
      'a1b.sql',
    ]);
  });
});
