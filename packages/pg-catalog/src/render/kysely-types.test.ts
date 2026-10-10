/**
 * The Kysely types file (SPEC 9.2): every member of the types schema's
 * table as replayed by PostgreSQL, the order of the blocks, and the exact
 * text of small catalogs. `kysely-driver.test.ts` holds the same type table
 * against node-postgres.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  domain,
  table,
} from '../test-support/kysely-catalog';
import { readReplayed } from '../test-support/replayed';
import { typesMigrations } from '../test-support/types-schema';
import { FILE_HEADER } from './catalog-module';
import { renderKyselyTypes } from './kysely-types';

const MEMBER = /^ {2}(.+?): (.+);$/u;

/** The members of `interface name`, in order, as name to type text. */
function members(text: string, name: string): ReadonlyMap<string, string> {
  const start = text.indexOf(`export interface ${name} {\n`);
  const body = text
    .slice(start, text.indexOf('\n}', start))
    .split('\n')
    .slice(1);
  return new Map(
    body.map((line): [string, string] => {
      const [, member = '', type = ''] = MEMBER.exec(line) ?? [];
      return [member, type];
    }),
  );
}

let text = '';

beforeAll(async () => {
  text = renderKyselyTypes(await readReplayed(typesMigrations, ['public']));
});

describe('renderKyselyTypes: columns of a real schema (SPEC 9.2)', () => {
  const NULLABLE_DATE =
    'ColumnType<Date | null, Date | string | null, Date | string | null>';
  it.each([
    ['id', 'GeneratedAlways<string>'],
    ['small', 'number | null'],
    ['regular', 'number'],
    [
      'big',
      'ColumnType<string | null, string | number | bigint | null, string | number | bigint | null>',
    ],
    [
      'amount',
      'ColumnType<string | null, string | number | null, string | number | null>',
    ],
    ['flag', 'boolean | null'],
    ['born', NULLABLE_DATE],
    ['happened_tz', NULLABLE_DATE],
    [
      'span',
      'ColumnType<PostgresInterval | null, PostgresInterval | string | null, PostgresInterval | string | null>',
    ],
    ['raw', 'Buffer | null'],
    ['docb', 'ColumnType<JsonValue | null, string | null, string | null>'],
    ['spot', 'ColumnType<Point | null, string | null, string | null>'],
    ['ring', 'ColumnType<Circle | null, string | null, string | null>'],
    ['code', 'string | null'],
    ['pairing', 'string | null'],
    ['periods', 'string | null'],
    ['feeling', 'Mood | null'],
    [
      'feelings',
      'ColumnType<string | null, Array<Mood> | string | null, Array<Mood> | string | null>',
    ],
    ['nothing', 'EmptyMood | null'],
    ['outside_level', 'string | null'],
    ['outside_score', 'unknown'],
    [
      'outside_scores',
      'ColumnType<string | null, Array<unknown> | string | null, Array<unknown> | string | null>',
    ],
    ['small_pos', 'number | null'],
    [
      'list',
      'ColumnType<Array<number> | null, Array<number> | string | null, Array<number> | string | null>',
    ],
    [
      'positives',
      'ColumnType<string | null, Array<number> | string | null, Array<number> | string | null>',
    ],
    ['required', 'ColumnType<string | null, string, string>'],
    ['defaulted', 'Generated<string | null>'],
    [
      'moments',
      'ColumnType<string | null, Array<Date | string> | string | null, Array<Date | string> | string | null>',
    ],
    [
      'bigs',
      'ColumnType<Array<string> | null, Array<string | number | bigint> | string | null, Array<string | number | bigint> | string | null>',
    ],
    [
      'amounts',
      'ColumnType<Array<number> | null, Array<string | number> | string | null, Array<string | number> | string | null>',
    ],
    [
      'procs',
      'ColumnType<Array<string> | null, Array<string> | string | null, Array<string> | string | null>',
    ],
    [
      'number_ranges',
      'ColumnType<Array<string> | null, Array<string> | string | null, Array<string> | string | null>',
    ],
    [
      'spots',
      'ColumnType<Array<Point> | null, Array<string> | string | null, Array<string> | string | null>',
    ],
    [
      'rings',
      'ColumnType<string | null, Array<string> | string | null, Array<string> | string | null>',
    ],
    [
      'periods_list',
      'ColumnType<string | null, Array<string> | string | null, Array<string> | string | null>',
    ],
    ['by_default', 'Generated<number>'],
    ['doubled', 'GeneratedAlways<number | null>'],
    ['with_default', 'Generated<string>'],
    ["'my column'", 'string | null'],
  ])('%s is %s', (member, type) => {
    expect(members(text, 'KindsTable').get(member)).toBe(type);
  });

  it('lists every column in table order and the enums as label unions', () => {
    const order = [...members(text, 'KindsTable').keys()];
    expect(order.slice(0, 4)).toEqual(['id', 'small', 'regular', 'big']);
    expect(order.at(-1)).toBe("'my column'");
    expect(order).toHaveLength(80);
    expect(text).toContain(
      "export type EmptyMood = never;\nexport type Mood = 'happy' | 'it\\'s fine';\n",
    );
  });

  it('declares the helpers it uses in order and imports what Kysely provides', () => {
    expect(text.split('\n').slice(0, 2)).toEqual([
      FILE_HEADER,
      "import type { ColumnType, Generated, GeneratedAlways } from 'kysely';",
    ]);
    const positions = [
      'JsonValue =',
      'PostgresInterval {',
      'Point {',
      'Circle {',
    ].map((declaration) =>
      text.indexOf(
        `export ${declaration.includes('=') ? 'type' : 'interface'} ${declaration}`,
      ),
    );
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual(
      positions.toSorted((left, right) => left - right),
    );
    expect(
      text.endsWith('export interface DB {\n  kinds: KindsTable;\n}\n'),
    ).toBe(true);
  });
});

describe('renderKyselyTypes: the file', () => {
  it('writes an exact, deterministic text whatever the order of the records', () => {
    const tables = {
      'audit.events': table('events', {
        at: column('timestamptz', {
          nullable: false,
          default: { expression: 'now()', literal: null },
        }),
      }),
      contacts: table('contacts', {
        id: column('uuid', { nullable: false }),
        kind: column('kind', { typeKind: 'enum', nullable: false }),
      }),
    };
    const forward = catalogOf({
      enums: { kind: ['person', 'company'] },
      tables,
    });
    const backward = catalogOf({
      enums: { kind: ['person', 'company'] },
      tables: {
        contacts: tables.contacts,
        'audit.events': tables['audit.events'],
      },
    });
    const expected = [
      FILE_HEADER,
      "import type { ColumnType } from 'kysely';",
      '',
      "export type Kind = 'person' | 'company';",
      '',
      'export interface AuditEventsTable {',
      '  at: ColumnType<Date, Date | string | undefined, Date | string>;',
      '}',
      '',
      'export interface ContactsTable {',
      '  id: string;',
      '  kind: Kind;',
      '}',
      '',
      'export interface DB {',
      "  'audit.events': AuditEventsTable;",
      '  contacts: ContactsTable;',
      '}',
      '',
    ].join('\n');
    expect(renderKyselyTypes(forward)).toBe(expected);
    expect(renderKyselyTypes(backward)).toBe(expected);
  });

  it('admits null on read for a nullable column of a NOT NULL domain at any depth, but not on write', () => {
    const catalog = catalogOf({
      domains: {
        strict: domain('strict', 'text', { nullable: false }),
        stricter: domain('stricter', 'strict', { typeKind: 'domain' }),
      },
      tables: {
        notes: table('notes', {
          body: column('stricter', { typeKind: 'domain' }),
          title: column('stricter', { typeKind: 'domain', nullable: false }),
        }),
      },
    });
    expect(members(renderKyselyTypes(catalog), 'NotesTable')).toEqual(
      new Map([
        ['body', 'ColumnType<string | null, string, string>'],
        ['title', 'string'],
      ]),
    );
  });

  it('writes an empty catalog and an empty table without imports', () => {
    expect(renderKyselyTypes(catalogOf({}))).toBe(
      `${FILE_HEADER}\n\nexport interface DB {}\n`,
    );
    expect(
      renderKyselyTypes(catalogOf({ tables: { empty: table('empty', {}) } })),
    ).toBe(
      `${FILE_HEADER}\n\nexport interface EmptyTable {}\n\nexport interface DB {\n  empty: EmptyTable;\n}\n`,
    );
  });

  it('applies overrides and writes the configured imports verbatim, declaring no helper an override names', () => {
    const catalog = catalogOf({
      tables: {
        readings: table('readings', {
          at: column('point'),
          big: column('int8', { nullable: false }),
        }),
      },
    });
    const rendered = renderKyselyTypes(catalog, {
      overrides: {
        point: 'Point',
        int8: { select: 'bigint', insert: 'bigint | string' },
      },
      imports: ["import type { Point } from './geometry';"],
    });
    expect(rendered).toContain(
      `${FILE_HEADER}\nimport type { ColumnType } from 'kysely';\nimport type { Point } from './geometry';\n\nexport interface ReadingsTable {`,
    );
    expect(rendered).toContain(
      '  at: Point | null;\n  big: ColumnType<bigint, bigint | string, bigint>;\n',
    );
    expect(rendered).not.toContain('export interface Point');
  });
});
