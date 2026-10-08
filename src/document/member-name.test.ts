import { describe, expect, it } from 'vitest';

import {
  assertMemberName,
  extensionNamespace,
  isAtMember,
  isExtensionMemberName,
  isMemberName,
  isMemberPath,
} from './member-name';

describe('isMemberName', () => {
  it('accepts names made of globally allowed characters', () => {
    for (const name of [
      'a',
      'Z9',
      'first-name',
      'first_name',
      'first name',
      'é',
      '名前',
      'a-b_c d',
    ]) {
      expect(isMemberName(name), name).toBe(true);
    }
  });

  it('rejects empty names and names starting or ending with - _ or space', () => {
    for (const name of [
      '',
      '-a',
      'a-',
      '_a',
      'a_',
      ' a',
      'a ',
      '_',
      '__proto__',
    ]) {
      expect(isMemberName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it('rejects every reserved character', () => {
    const reserved = '+,.[]!"#$%&\'()*/:;<=>?@\\^`{|}~\u007F\u0000\u001F';
    for (const char of reserved) {
      expect(isMemberName(`a${char}b`), JSON.stringify(char)).toBe(false);
    }
  });
});

describe('extension and @ members', () => {
  it('recognizes namespace:name and @-members', () => {
    expect(isExtensionMemberName('atomic:operations')).toBe(true);
    expect(isExtensionMemberName('v1:id')).toBe(true);
    expect(extensionNamespace('atomic:results')).toBe('atomic');
    expect(isExtensionMemberName(':x')).toBe(false);
    expect(isExtensionMemberName('a-b:x')).toBe(false);
    expect(isExtensionMemberName('atomic:-x')).toBe(false);
    expect(isExtensionMemberName('plain')).toBe(false);
    expect(extensionNamespace('plain')).toBeUndefined();
    expect(isAtMember('@context')).toBe(true);
    expect(isAtMember('context')).toBe(false);
  });
});

describe('isMemberPath', () => {
  it('accepts dot-separated member names only', () => {
    expect(isMemberPath('comments.author')).toBe(true);
    expect(isMemberPath('author')).toBe(true);
    expect(isMemberPath('comments..author')).toBe(false);
    expect(isMemberPath('.author')).toBe(false);
    expect(isMemberPath('')).toBe(false);
  });
});

describe('assertMemberName', () => {
  it('names the option in the TypeError and rejects prototype keys', () => {
    expect(() => {
      assertMemberName('attribute', 'ok');
    }).not.toThrow();
    expect(() => {
      assertMemberName('attribute', 'a.b');
    }).toThrow(/attribute "a\.b" is not a valid JSON:API member name/u);
    expect(() => {
      assertMemberName('attribute', 'constructor');
    }).toThrow(/attribute "constructor" is reserved/u);
    expect(() => {
      assertMemberName('attribute', 'prototype');
    }).toThrow(TypeError);
  });
});
