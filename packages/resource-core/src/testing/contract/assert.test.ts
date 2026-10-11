import { describe, expect, it } from 'vitest';

import {
  assertEqual,
  assertThat,
  ContractFailure,
  rejection,
  sameValue,
} from './assert';

describe('sameValue', () => {
  it.each([
    ['equal primitives', 'a', 'a'],
    ['NaN', Number.NaN, Number.NaN],
    [
      'objects in another key order',
      { a: 1, b: [2, { c: null }] },
      { b: [2, { c: null }], a: 1 },
    ],
    [
      'a null-prototype object and a plain one',
      Object.assign(Object.create(null) as object, { a: 1 }),
      { a: 1 },
    ],
    ['empty arrays', [], []],
  ])('holds for %s', (_name, left, right) => {
    expect(sameValue(left, right)).toBe(true);
  });

  it.each([
    ['a string and a number', '1.50', 1.5],
    ['zero and negative zero', 0, -0],
    ['a missing key and one holding undefined', {}, { secret: undefined }],
    ['an extra key', { a: 1 }, { a: 1, b: 2 }],
    ['arrays of other lengths', [1], [1, 2]],
    ['an array and an object with its keys', ['a'], { 0: 'a' }],
    ['a date and its text', new Date(0), '1970-01-01T00:00:00.000Z'],
    ['null and undefined', null, undefined],
  ])('fails for %s', (_name, left, right) => {
    expect(sameValue(left, right)).toBe(false);
  });
});

describe('assertEqual', () => {
  it('names what it checked, the expected and the actual value', () => {
    expect(() => {
      assertEqual({ estimate: 1.5, id: 1n }, { estimate: '1.50' }, 'the row');
    }).toThrow(
      new ContractFailure(
        'the row: expected {"estimate":"1.50"}, got {"estimate":1.5,"id":"1n"}',
      ),
    );
  });

  it('spells out undefined at the top and in a value', () => {
    expect(() => {
      assertEqual(undefined, { a: undefined }, 'the value');
    }).toThrow('the value: expected {"a":"<undefined>"}, got undefined');
  });

  it('names a value JSON has no text for', () => {
    expect(() => {
      assertEqual(Symbol.for('row'), null, 'the value');
    }).toThrow('the value: expected null, got Symbol(row)');
  });

  it('passes for the same JSON value', () => {
    expect(() => {
      assertEqual([{ a: 1 }], [{ a: 1 }], 'the list');
    }).not.toThrow();
  });
});

describe('assertThat', () => {
  it('throws a ContractFailure with the message when the condition fails', () => {
    expect(() => {
      assertThat(false, 'the first create succeeded');
    }).toThrow(ContractFailure);
    expect(() => {
      assertThat(true, 'never thrown');
    }).not.toThrow();
  });
});

describe('rejection', () => {
  it('returns what the promise rejected with', async () => {
    const stop = new Error('stop');
    await expect(rejection(Promise.reject(stop), 'the run')).resolves.toBe(
      stop,
    );
  });

  it('fails when the promise resolves', async () => {
    await expect(rejection(Promise.resolve(1), 'the create')).rejects.toThrow(
      'the create: expected a rejection, but it resolved',
    );
  });
});
