import { describe, expect, it } from 'vitest';

import { isBundle, isExpression, isLocalVariable } from './bundle';
import {
  bundle,
  local,
  text,
  variable,
  withPattern,
} from './test-support/bundles';

/** A bundle whose only declaration is `declaration`. */
function declaring(declaration: unknown): Record<string, unknown> {
  return { ...withPattern([]), declarations: [declaration] };
}

describe('isBundle (SPEC 6.1)', () => {
  it('reads the bundles of SDK 4 and of SDK 2 and 3', () => {
    const sdk3 = {
      id: 'b',
      declarations: [{ type: 'input-variable', name: 'count' }],
      messages: [
        {
          id: 'm',
          bundleId: 'b',
          locale: 'en',
          selectors: [],
          variants: [{ id: 'v', messageId: 'm', matches: [], pattern: [] }],
        },
      ],
    };
    expect(isBundle(bundle(['en', 'ar']))).toBe(true);
    expect(isBundle(sdk3)).toBe(true);
  });

  it('refuses a bundle without declarations, messages, locales, variants, or typed parts', () => {
    expect(isBundle(null)).toBe(false);
    expect(isBundle({ id: 'b', messages: [] })).toBe(false);
    expect(isBundle({ id: 'b', declarations: [] })).toBe(false);
    expect(isBundle({ id: 1, declarations: [], messages: [] })).toBe(false);
    expect(isBundle({ ...withPattern([]), messages: [null] })).toBe(false);
    expect(isBundle({ ...withPattern([]), messages: [{ variants: [] }] })).toBe(
      false,
    );
    expect(isBundle({ ...withPattern([]), messages: [{ locale: 'en' }] })).toBe(
      false,
    );
    expect(
      isBundle({
        ...withPattern([]),
        messages: [{ locale: 'en', variants: [null] }],
      }),
    ).toBe(false);
    expect(isBundle(withPattern('Hello'))).toBe(false);
    expect(isBundle(withPattern([{ value: 'Hello' }]))).toBe(false);
    expect(isBundle(withPattern([text('Hello')]))).toBe(true);
  });

  it('refuses an expression or a declaration it cannot read', () => {
    expect(isBundle(withPattern([{ type: 'expression' }]))).toBe(false);
    expect(
      isBundle(withPattern([{ type: 'expression', arg: { type: 'call' } }])),
    ).toBe(false);
    expect(
      isBundle(
        withPattern([
          { ...variable('n'), annotation: { type: 'function-reference' } },
        ]),
      ),
    ).toBe(false);
    expect(isBundle(declaring({ type: 'input-variable' }))).toBe(false);
    expect(isBundle(declaring({ type: 'local-variable', name: 'n' }))).toBe(
      false,
    );
    expect(
      isBundle(
        declaring({ type: 'local-variable', name: 'n', value: text('x') }),
      ),
    ).toBe(false);
  });

  it('reads markup, literals, and declarations of other types as they are', () => {
    const markup = [
      { type: 'markup-start', name: 'b' },
      { type: 'expression', arg: { type: 'literal', value: '5' } },
      { type: 'markup-end', name: 'b' },
    ];
    expect(
      isBundle(
        bundle(['en'], markup, [
          { type: 'input-variable', name: 'count' },
          local('countPlural', 'count', 'plural'),
          { type: 'a-later-type', name: 'n' },
        ]),
      ),
    ).toBe(true);
  });
});

describe('isExpression and isLocalVariable', () => {
  it('read an annotation only from a function reference with a name', () => {
    expect(isExpression(variable('count', 'number'))).toBe(true);
    expect(isExpression(variable('count'))).toBe(true);
    expect(isExpression(text('count'))).toBe(false);
    expect(isLocalVariable(local('n', 'count', 'number'))).toBe(true);
    expect(isLocalVariable({ type: 'input-variable', name: 'n' })).toBe(false);
  });
});
