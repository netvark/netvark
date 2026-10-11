import { describe, expect, it } from 'vitest';

import {
  errorKey,
  errorRef,
  errorResponseRef,
  schemaKey,
  schemaRef,
} from './component-names';

const COMPONENT_KEY = /^[a-zA-Z0-9.\-_]+$/u;
const SUFFIXES = ['resource', 'identifier', 'create', 'update'] as const;
/** Names that differ only where a careless spelling would merge them. */
const NAMES = [
  'a',
  'a-create',
  'a b',
  'a.0020b',
  'a0020b',
  'a_0020b',
  'größe',
  'gr.00F6.00DFe',
  // The same word decomposed: o and U+0308 COMBINING DIAERESIS.
  'gro\u0308\u00DFe',
  '\u{1F600}',
  '\uD83D',
  '\uDE00',
  '\uDE00\uD83D',
  'a.b',
  'a!b',
  "a'b",
  'a(b)',
  'a*b~',
  'a%20b',
  '',
  '.',
  '_error',
];

describe('schemaKey', () => {
  it.each([
    ['contacts', 'contacts.resource'],
    ['import_rows', 'import_rows.resource'],
    ['meeting-rooms', 'meeting-rooms.resource'],
    ['nick name', 'nick.0020name.resource'],
    ['größe', 'gr.00F6.00DFe.resource'],
    ['\u{1F600}', '.D83D.DE00.resource'],
  ])('spells %s as a component key', (type, key) => {
    expect(schemaKey(type, 'resource')).toBe(key);
    expect(key).toMatch(COMPONENT_KEY);
  });

  it('refers to components.schemas', () => {
    expect(schemaRef('contacts', 'identifier')).toEqual({
      $ref: '#/components/schemas/contacts.identifier',
    });
  });
});

describe('errorKey', () => {
  it.each([
    ['CONFLICT', '_error.CONFLICT'],
    ['CONTACTS_EMAIL_UNIQUE', '_error.CONTACTS_EMAIL_UNIQUE'],
    ['orders.total', '_error.orders.002Etotal'],
    ['a!b', '_error.a.0021b'],
  ])('spells %s as a component key', (code, key) => {
    expect(errorKey(code)).toBe(key);
    expect(errorRef(code)).toBe(`#/components/schemas/${key}`);
    expect(errorResponseRef(code)).toBe(`#/components/responses/${key}`);
  });
});

describe('component keys', () => {
  const keys = [
    ...NAMES.flatMap((name) =>
      SUFFIXES.map((suffix) => schemaKey(name, suffix)),
    ),
    ...NAMES.map((name) => errorKey(name)),
  ];

  it('are distinct for distinct names, suffixes, and codes', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hold only the characters of a component key, however odd the name', () => {
    expect(keys.filter((key) => !COMPONENT_KEY.test(key))).toEqual([]);
  });

  it('never put a type and an error object at one key: no type is spelled with a leading `_`', () => {
    const typeKeys = NAMES.filter((name) => /^[^_]/u.test(name)).map((name) =>
      schemaKey(name, 'resource'),
    );
    expect(typeKeys.filter((key) => key.startsWith('_'))).toEqual([]);
  });
});
