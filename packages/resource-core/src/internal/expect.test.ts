import { describe, expect, it } from 'vitest';

import { typeErrorOf } from '../test-support/failure';
import {
  expectKnownKeys,
  expectOneOf,
  expectRecord,
  expectRegistry,
  optionalArray,
  optionalBoolean,
  optionalPositiveInteger,
  optionalString,
} from './expect';

describe('expectRecord and expectKnownKeys', () => {
  it('names the path and what it received', () => {
    expect(typeErrorOf(() => expectRecord('a.b', []))).toBe(
      'a.b: must be an object, received []',
    );
    expect(
      typeErrorOf(() => {
        expectKnownKeys('a', { b: 1, c: 2 }, ['b']);
      }),
    ).toBe('a: unknown member "c"');
  });

  it('counts a member set to undefined as absent', () => {
    expect(() => {
      expectKnownKeys('a', { b: 1, c: undefined }, ['b']);
    }).not.toThrow();
  });
});

describe('optional members', () => {
  it('passes undefined and a value of the type, and refuses anything else', () => {
    for (const value of [undefined, 'x']) {
      expect(optionalString('p', value)).toBe(value);
    }
    for (const value of [undefined, false]) {
      expect(optionalBoolean('p', value)).toBe(value);
    }
    for (const value of [undefined, [1]]) {
      expect(optionalArray('p', value)).toBe(value);
    }
    expect(typeErrorOf(() => optionalString('p', 1))).toBe(
      'p: must be a string, received 1',
    );
    expect(typeErrorOf(() => optionalBoolean('p', 'no'))).toBe(
      'p: must be a boolean, received "no"',
    );
    expect(typeErrorOf(() => optionalArray('p', {}))).toBe(
      'p: must be an array, received {}',
    );
  });

  it('takes a positive safe integer only', () => {
    expect(optionalPositiveInteger('p', 1)).toBe(1);
    for (const [value, text] of [
      [0, '0'],
      [1.5, '1.5'],
      [2 ** 53, '9007199254740992'],
      ['1', '"1"'],
    ] as const) {
      expect(typeErrorOf(() => optionalPositiveInteger('p', value))).toBe(
        `p: must be a positive integer, received ${text}`,
      );
    }
  });

  it('takes a member of a closed vocabulary', () => {
    expect(expectOneOf('p', 'b', ['a', 'b'])).toBe('b');
    expect(typeErrorOf(() => expectOneOf('p', 'c', ['a', 'b']))).toBe(
      'p: "c" is not one of a, b',
    );
  });
});

describe('expectRegistry', () => {
  it('checks each entry at its own path and returns a fresh record of the results', () => {
    const entry = { n: 1 };
    const value = { first: entry, constructor: { n: 2 } };
    const seen: Array<string> = [];
    const registry = expectRegistry('r', value, (path, item, name) => {
      seen.push(`${path} ${name}`);
      return expectRecord(path, item);
    });
    expect(seen).toEqual(['r.first first', 'r.constructor constructor']);
    expect(registry).not.toBe(value);
    expect(registry['first']).toBe(entry);
    expect(Object.hasOwn(registry, 'constructor')).toBe(true);
  });

  it('keeps a __proto__ entry as an own member instead of a prototype', () => {
    const value: Record<string, unknown> = JSON.parse('{"__proto__":{"n":1}}');
    const registry = expectRegistry('r', value, (path, item) =>
      expectRecord(path, item),
    );
    expect(Object.getPrototypeOf(registry)).toBe(Object.prototype);
    expect(Object.hasOwn(registry, '__proto__')).toBe(true);
  });

  it('passes the entry check failure through', () => {
    expect(
      typeErrorOf(() =>
        expectRegistry('r', { bad: 1 }, (path, item) =>
          expectRecord(path, item),
        ),
      ),
    ).toBe('r.bad: must be an object, received 1');
  });
});
