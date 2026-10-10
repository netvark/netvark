import type { PlanOptions } from './context';

import { describe, expect, it } from 'vitest';

import { thrown } from '../test-support/fixtures';
import { bindingContext } from './context';

/** A scope object an application might pass by mistake: its prototype is not Object's. */
class Scope {
  public readonly tenant: string = 'acme';
}

/** SPEC 6.1: the caller's context, checked before the request and copied. */
describe('bindingContext', () => {
  it('binds nothing for an absent or empty context', () => {
    const options: PlanOptions = {};
    expect(bindingContext(options.context)).toBeUndefined();
    expect(bindingContext({})).toBeUndefined();
    expect(bindingContext(Object.create(null))).toBeUndefined();
  });

  it('accepts strings, finite numbers, bigints, booleans, and null', () => {
    const context = {
      tenant: 'acme',
      shard: 3,
      ratio: -1.5,
      account: 9_007_199_254_740_993n,
      admin: false,
      region: null,
    };
    expect(bindingContext(context)).toEqual(context);
    const bare = Object.assign(Object.create(null), { tenant: 'acme' });
    expect(bindingContext(bare)).toEqual({ tenant: 'acme' });
  });

  it('returns a copy, so a later change to the argument does not move the binding', () => {
    const context: Record<string, string> = { tenant: 'acme' };
    const bound = bindingContext(context);
    context['tenant'] = 'globex';
    expect(bound).toEqual({ tenant: 'acme' });
  });

  it.each([
    ['a string', 'acme'],
    ['an array', ['acme']],
    ['null', null],
    ['a Date', new Date(0)],
    ['a Map', new Map([['tenant', 'acme']])],
    ['a class instance', new Scope()],
  ])(
    'rejects %s, which would bind nothing or the wrong thing',
    (_name, value) => {
      expect(thrown(() => bindingContext(value))).toEqual(
        new TypeError('context must be a plain object'),
      );
    },
  );

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a nested object', { id: 'acme' }],
    ['an array', ['acme']],
    ['a Date', new Date(0)],
    ['a function', () => 'acme'],
    ['a symbol', Symbol('acme')],
  ])('rejects a member that is %s, naming it', (_name, value) => {
    expect(thrown(() => bindingContext({ tenant: value }))).toEqual(
      new TypeError(
        'context.tenant must be a string, a finite number, a bigint, a boolean, or null',
      ),
    );
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects the prototype key %s as a name (SPEC 2.3)',
    (name) => {
      const context: unknown = JSON.parse(`{"${name}": "acme"}`);
      expect(thrown(() => bindingContext(context))).toEqual(
        new TypeError(`context.${name} is a reserved name`),
      );
    },
  );
});
