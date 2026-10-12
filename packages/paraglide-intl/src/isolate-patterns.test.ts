import { describe, expect, it } from 'vitest';

import {
  FIRST_STRONG_ISOLATE,
  POP_DIRECTIONAL_ISOLATE,
} from '@netvark/intl-core';

import { isBundle, isolateBundle, isolatePattern } from './isolate-patterns';

const OPEN = { type: 'text', value: FIRST_STRONG_ISOLATE };
const CLOSE = { type: 'text', value: POP_DIRECTIONAL_ISOLATE };

const text = (value: string) => ({ type: 'text', value });
const variable = (name: string) => ({
  type: 'expression',
  arg: { type: 'variable-reference', name },
});

/** A bundle as SDK 4's `selectBundleNested()` returns it, frozen throughout. */
function bundle(locales: ReadonlyArray<string>) {
  return structuredClone({
    id: 'shared_by',
    declarations: [{ type: 'input-variable', name: 'name' }],
    lixcol_entity_id: 'shared_by',
    messages: locales.map((locale) => ({
      id: `message-${locale}`,
      bundle_id: 'shared_by',
      locale,
      selectors: [],
      variants: [
        {
          id: `variant-${locale}`,
          message_id: `message-${locale}`,
          matches: [],
          pattern: [text('Shared by '), variable('name')],
        },
      ],
    })),
  });
}

/** A bundle of one message whose one variant has `pattern`. */
function withPattern(pattern: unknown) {
  return { id: 'b', messages: [{ locale: 'en', variants: [{ pattern }] }] };
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

describe('isolatePattern (SPEC 6.2)', () => {
  it('puts each expression between the isolates, as two text parts', () => {
    expect(
      isolatePattern([
        text('Shared by '),
        variable('name'),
        text(' ('),
        variable('count'),
        text(')'),
      ]),
    ).toEqual([
      text('Shared by '),
      OPEN,
      variable('name'),
      CLOSE,
      text(' ('),
      OPEN,
      variable('count'),
      CLOSE,
      text(')'),
    ]);
  });

  it('isolates a literal expression and keeps markup in place', () => {
    const literal = {
      type: 'expression',
      arg: { type: 'literal', value: 'x' },
    };
    const start = { type: 'markup-start', name: 'b' };
    const end = { type: 'markup-end', name: 'b' };
    expect(isolatePattern([start, literal, end])).toEqual([
      start,
      OPEN,
      literal,
      CLOSE,
      end,
    ]);
  });

  it('returns the pattern itself for one part, or without expressions', () => {
    const alone = [variable('name')];
    const plain = [text('Hello'), { type: 'markup-standalone', name: 'icon' }];
    expect(isolatePattern(alone)).toBe(alone);
    expect(isolatePattern(plain)).toBe(plain);
    expect(isolatePattern([])).toEqual([]);
  });
});

describe('isolateBundle (SPEC 6.2)', () => {
  it('rewrites the messages of the isolated locales only, keeping every other field', () => {
    const input = deepFreeze(bundle(['en', 'ar']));
    const output = isolateBundle(input, new Set(['ar']));
    const [en, ar] = output?.messages ?? [];
    expect(en).toBe(input.messages[0]);
    expect(ar).toEqual({
      ...input.messages[1],
      variants: [
        {
          ...input.messages[1]?.variants[0],
          pattern: [text('Shared by '), OPEN, variable('name'), CLOSE],
        },
      ],
    });
    expect({ ...output, messages: [] }).toEqual({ ...input, messages: [] });
  });

  it('returns undefined when no pattern of an isolated locale changes', () => {
    expect(isolateBundle(bundle(['en']), new Set(['ar']))).toBeUndefined();
    const bare = bundle(['en']);
    bare.messages[0]!.variants[0]!.pattern = [variable('name')];
    expect(isolateBundle(bare, new Set(['en']))).toBeUndefined();
  });
});

describe('isBundle', () => {
  it('reads the bundles of SDK 4 and of SDK 2 and 3', () => {
    const sdk4 = bundle(['en']);
    const sdk3 = {
      id: 'b',
      declarations: [],
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
    expect(isBundle(sdk4)).toBe(true);
    expect(isBundle(sdk3)).toBe(true);
  });

  it('refuses a bundle without messages, locales, variants, or typed parts', () => {
    expect(isBundle(null)).toBe(false);
    expect(isBundle({ id: 'b' })).toBe(false);
    expect(isBundle({ id: 'b', messages: [null] })).toBe(false);
    expect(
      isBundle({ id: 'b', messages: [{ locale: 'en', variants: [null] }] }),
    ).toBe(false);
    expect(isBundle({ id: 1, messages: [] })).toBe(false);
    expect(isBundle({ id: 'b', messages: [{ variants: [] }] })).toBe(false);
    expect(isBundle({ id: 'b', messages: [{ locale: 'en' }] })).toBe(false);
    expect(isBundle(withPattern('Hello'))).toBe(false);
    expect(isBundle(withPattern([{ value: 'Hello' }]))).toBe(false);
    expect(isBundle(withPattern([text('Hello')]))).toBe(true);
  });
});
