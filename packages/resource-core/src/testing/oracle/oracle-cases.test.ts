import type { OracleCase, OracleVerdict, WritableFixture } from './types';

/**
 * `oracleCases` (SPEC 7.3) over the registry tests' resources: what each
 * case writes and where, the CHECKs a copy holds, each validator once, and
 * how each judge reads a verdict. The database's own verdicts are
 * pg-catalog's and the end-to-end suite's to take.
 */
import { describe, expect, it } from 'vitest';

import {
  Contacts,
  declare,
  Meetings,
  Organizations,
} from '../../test-support/registry';
import { oracleCases } from './oracle-cases';

const REGISTRY = [Organizations, Contacts, Meetings];
const CHECK_VIOLATION = '23514';

function stored(...texts: ReadonlyArray<string | null>): OracleVerdict {
  return { accepted: true, stored: texts };
}

function refused(
  code: string,
  constraint: string | null = null,
): OracleVerdict {
  return { accepted: false, code, constraint };
}

function caseOf(cases: ReadonlyArray<OracleCase>, subject: string): OracleCase {
  const found = cases.find((candidate) => candidate.subject === subject);
  if (found === undefined) {
    throw new Error(`no case ${subject}`);
  }
  return found;
}

function fixtureOf(found: OracleCase, label: string): WritableFixture {
  const fixture = found.fixtures.find((candidate) => candidate.label === label);
  if (fixture === undefined || !('texts' in fixture)) {
    throw new Error(`no writable fixture ${label} in ${found.subject}`);
  }
  return fixture;
}

const CASES = oracleCases(REGISTRY);

describe('oracleCases', () => {
  it('tries every member a client writes or reads, and each validator once', () => {
    expect(CASES.map(({ kind, subject }) => `${kind} ${subject}`)).toEqual([
      'field organizations.name',
      'field contacts.name',
      'field contacts.email',
      'validator domain email CHECK email_check (validator email)',
      'field meetings.room',
      'field meetings.notes',
      'field meetings.attendees',
      'relationship meetings.contact',
      'validator meetings CHECK meetings_room_check (validator room)',
      'validator meetings CHECK meetings_contact_or_notes (validator contactOrNotes)',
    ]);
  });

  it('writes a member into a copy of its column holding its NOT NULL and the CHECKs its schema enforces', () => {
    expect(caseOf(CASES, 'contacts.name').probe).toEqual({
      kind: 'columns',
      table: 'contacts',
      columns: ['name'],
      checks: ['contacts_name_check'],
      notNull: true,
    });
    expect(caseOf(CASES, 'meetings.room').probe).toMatchObject({
      checks: ['meetings_room_check'],
    });
    const attendees = caseOf(CASES, 'meetings.attendees');
    expect(fixtureOf(attendees, 'an element: one character').texts).toEqual([
      '{"a"}',
    ]);
  });

  it('judges a field as its write schema and its read schema do', () => {
    const name = caseOf(CASES, 'contacts.name');
    const one = fixtureOf(name, 'one character');
    expect(one.judge(stored('a'))).toBeUndefined();
    expect(one.judge(refused(CHECK_VIOLATION, 'contacts_name_check'))).toBe(
      'the schema accepts it; the database refuses it (23514 contacts_name_check)',
    );
    expect(one.judge(stored('b'))).toBe(
      'the schema accepts it; the database stores b',
    );
    const empty = fixtureOf(name, 'the empty string');
    expect(empty.judge(refused(CHECK_VIOLATION))).toBeUndefined();
    expect(empty.judge(stored(''))).toBe(
      'the schema refuses it; the database stores it as sent',
    );
    const readOnly = fixtureOf(
      caseOf(CASES, 'organizations.name'),
      'one character',
    );
    expect(readOnly.judge(refused('22001'))).toBeUndefined();
    expect(readOnly.judge(stored('a'))).toBeUndefined();
  });

  it('judges a relationship by its linkage schema, the id as the key column holds it', () => {
    const contact = caseOf(CASES, 'meetings.contact');
    const upper = fixtureOf(contact, 'upper case');
    const lower = (upper.value as string).toLowerCase();
    expect(upper.judge(stored(lower))).toBeUndefined();
    expect(upper.judge(refused('22P02'))).toBe(
      'the schema accepts it; the database refuses it (22P02)',
    );
    const braces = fixtureOf(contact, 'braces');
    expect(braces.judge(stored(lower))).toBeUndefined();
    expect(braces.judge(stored(braces.value as string))).toBe(
      'the schema refuses it; the database stores it as sent',
    );
  });

  it('judges a validator fixture by the CHECK it stands for alone, without the NOT NULL of its column', () => {
    const room = caseOf(
      CASES,
      'meetings CHECK meetings_room_check (validator room)',
    );
    expect(room.probe).toEqual({
      kind: 'columns',
      table: 'meetings',
      columns: ['room'],
      checks: ['meetings_room_check'],
      notNull: false,
    });
    const accept = fixtureOf(room, 'accept[0]');
    expect(accept.judge(stored('a-12'))).toBeUndefined();
    expect(accept.judge(refused(CHECK_VIOLATION, 'meetings_room_check'))).toBe(
      'the validator accepts it; the database refuses it (23514 meetings_room_check)',
    );
    const reject = fixtureOf(room, 'reject[0]');
    expect(reject.texts).toEqual(['x-12']);
    expect(
      reject.judge(refused(CHECK_VIOLATION, 'meetings_room_check')),
    ).toBeUndefined();
    expect(reject.judge(stored('x-12'))).toBe(
      'the validator refuses it; the database accepts it',
    );
    expect(reject.judge(refused('22P02'))).toBe(
      'the validator refuses it; the database refuses it (22P02) before meetings_room_check decides',
    );
  });

  it("writes a validator's object into the columns of its members, a relationship as its id", () => {
    const either = caseOf(
      CASES,
      'meetings CHECK meetings_contact_or_notes (validator contactOrNotes)',
    );
    expect(either.probe).toMatchObject({
      columns: ['contact_id', 'notes'],
      notNull: false,
    });
    expect(
      either.fixtures.map((fixture) => 'texts' in fixture && fixture.texts),
    ).toEqual([
      ['7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69', null],
      [null, 'Lobby'],
      [null, null],
    ]);
  });

  it("tries a domain's validator in a value of the domain, once for every member of it", () => {
    const email = caseOf(
      CASES,
      'domain email CHECK email_check (validator email)',
    );
    expect(email.probe).toEqual({ kind: 'domain', domain: 'email' });
    expect(fixtureOf(email, 'accept[1]').texts).toEqual([null]);
    expect(
      fixtureOf(email, 'reject[0]').judge(
        refused(CHECK_VIOLATION, 'email_check'),
      ),
    ).toBeUndefined();
  });

  it('runs the registry checks', () => {
    expect(() => oracleCases([Contacts])).toThrow(
      /^oracleCases: relationship contacts\.organization targets organizations, which is not listed$/u,
    );
  });
});

describe('oracleCases on a codec', () => {
  const Scheduled = declare('meetings', {
    operations: ['get', 'create'],
    scope: 'organization',
    fields: {
      room: { access: 'readWrite' },
      during: { access: 'readWrite', codec: 'range' },
    },
    rules: { meetings_room_check: { validator: 'room' } },
  });
  const storage = {
    range: {
      write: (value: { readonly start: string; readonly end: string }) =>
        `[${value.start},${value.end})`,
      read: (text: string) => {
        const [start, end] = text.slice(1, -1).split(',');
        return { start, end };
      },
    },
  };
  const START = '2026-01-05T09:00:00Z';
  const END = '2026-01-05T10:00:00Z';

  it('round-trips each fixture through its storage codec', () => {
    const during = caseOf(
      oracleCases([Organizations, Contacts, Scheduled], { storage }),
      'meetings.during (codec range)',
    );
    expect(during.probe).toEqual({
      kind: 'columns',
      table: 'meetings',
      columns: ['during'],
      checks: [],
      notNull: true,
    });
    const fixture = fixtureOf(during, 'fixtures[0]');
    expect(fixture.texts).toEqual([`[${START},${END})`]);
    expect(fixture.judge(stored(`[${START},${END})`))).toBeUndefined();
    expect(fixture.judge(stored(`[${START},2026-01-05T11:00:00Z)`))).toBe(
      `the database stores [${START},2026-01-05T11:00:00Z), which reads back as {"start":"${START}","end":"2026-01-05T11:00:00Z"}`,
    );
    expect(fixture.judge(stored(`[nope,${END})`))).toBe(
      `the database stores [nope,${END}), which reads back as {"start":"nope","end":"${END}"}`,
    );
    expect(fixture.judge(refused('22007'))).toBe(
      'the database refuses it (22007)',
    );
    expect(fixture.judge(stored(null))).toBe('the database stores NULL');
  });

  it('reports what the storage codec throws', () => {
    const throwing = {
      range: {
        write: () => {
          throw new Error('no range');
        },
        read: () => {
          throw new Error('bad text');
        },
      },
    };
    const during = caseOf(
      oracleCases([Organizations, Contacts, Scheduled], { storage: throwing }),
      'meetings.during (codec range)',
    );
    expect(during.fixtures).toEqual([
      {
        label: 'fixtures[0]',
        value: { start: START, end: END },
        unwritable: 'the storage codec cannot write it: no range',
      },
    ]);
    const reading = caseOf(
      oracleCases([Organizations, Contacts, Scheduled], {
        storage: { range: { ...storage.range, read: throwing.range.read } },
      }),
      'meetings.during (codec range)',
    );
    expect(fixtureOf(reading, 'fixtures[0]').judge(stored('[a,b)'))).toBe(
      "the storage codec's read throws on [a,b): bad text",
    );
  });

  it('reports a storage codec that writes anything but text', () => {
    const during = caseOf(
      oracleCases([Organizations, Contacts, Scheduled], {
        // A JavaScript storage codec can return anything.
        storage: {
          range: { read: storage.range.read, write: (() => 3) as never },
        },
      }),
      'meetings.during (codec range)',
    );
    expect(during.fixtures[0]).toMatchObject({
      unwritable:
        'the storage codec cannot write it: write returned 3, not text',
    });
  });

  it('refuses a codec the options give no storage codec', () => {
    expect(() => oracleCases([Organizations, Contacts, Scheduled])).toThrow(
      new TypeError(
        'oracleCases.options.storage.range: must be a storage codec over text, since meetings.during names codec range',
      ),
    );
  });
});
