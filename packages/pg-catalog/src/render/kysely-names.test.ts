import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { memberName, pascalCase, stringLiteral } from './kysely-names';

const LINE_SEPARATOR = String.fromCodePoint(0x20_28);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x20_29);
const CONTROL = String.fromCodePoint(1);
const NUL = String.fromCodePoint(0);
const BACKSLASH = String.fromCodePoint(0x5c);

describe('pascalCase (SPEC 9.2)', () => {
  it.each([
    ['contacts', 'Contacts'],
    ['contact_phones', 'ContactPhones'],
    ['audit.events', 'AuditEvents'],
    ['Weird Name', 'WeirdName'],
    ['kebab-case-name', 'KebabCaseName'],
    ['contactID', 'ContactID'],
    ['__private', 'Private'],
    ['2fa_codes', '_2faCodes'],
    ['v2', 'V2'],
    ['日本', '_'],
    ['', '_'],
  ])('%j is %j', (name, expected) => {
    expect(pascalCase(name)).toBe(expected);
  });
});

describe('stringLiteral and memberName', () => {
  it('escapes backslashes, quotes, line breaks, and control characters', () => {
    expect(stringLiteral("it's")).toBe(String.raw`'it\'s'`);
    expect(stringLiteral(String.raw`a\b`)).toBe(String.raw`'a\\b'`);
    expect(stringLiteral(`a\nb\rc\td${NUL}`)).toBe(
      String.raw`'a\nb\rc\u0009d\u0000'`,
    );
    expect(stringLiteral(`${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}`)).toBe(
      `'${BACKSLASH}u2028${BACKSLASH}u2029'`,
    );
    expect(stringLiteral('"日本😀"')).toBe(`'"日本😀"'`);
  });

  it('evaluates back to the same text', () => {
    const texts = ["it's", String.raw`a\b`, 'x\ny', CONTROL, '"', '😀'];
    for (const text of [...texts, LINE_SEPARATOR, PARAGRAPH_SEPARATOR]) {
      expect(runInNewContext(stringLiteral(text))).toBe(text);
    }
  });

  it('keeps identifiers bare and quotes every other name', () => {
    expect(memberName('organization_id')).toBe('organization_id');
    expect(memberName('$ref')).toBe('$ref');
    expect(memberName('default')).toBe('default');
    expect(memberName('audit.events')).toBe("'audit.events'");
    expect(memberName('my column')).toBe("'my column'");
    expect(memberName('2024')).toBe("'2024'");
    expect(memberName('café')).toBe("'café'");
  });
});
