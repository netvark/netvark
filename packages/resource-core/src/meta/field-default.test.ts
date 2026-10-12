import type { ValueForm } from '../schema/value-form';

/**
 * A member's default (SPEC 8): the constant's text as the catalog holds
 * it, and its read form (SPEC 5.1), the value a read gives, by the type
 * the member's value spec ends in; nothing for an expression, a codec's
 * field, or a constant outside the read form, and a relationship's as its
 * id's text.
 */
import { describe, expect, it } from 'vitest';

import { specOf } from '../schema/value-form';
import { TEST_REGISTRIES } from '../test-support/definer';
import { fieldDefault } from './field-default';

const DATE_TIME = {
  kind: 'string',
  type: 'timestamp',
  fractionDigits: 6,
} as const;
const INSTANT = {
  kind: 'string',
  type: 'timestamptz',
  fractionDigits: 6,
} as const;

/** The default of an attribute of `form` whose constant is `literal`. */
function attribute(form: ValueForm, literal: string | null) {
  return fieldDefault({ literal }, specOf(form), false);
}

/** An array of `element`. */
function arrayOf(element: ValueForm): ValueForm {
  return { kind: 'array', element: specOf(element) };
}

describe('fieldDefault (SPEC 8)', () => {
  it.each<readonly [string, ValueForm, string, unknown]>([
    ['text', { kind: 'text', type: 'text' }, 'active', 'active'],
    [
      'an enum label',
      { kind: 'enum', type: 'contact_kind' },
      'person',
      'person',
    ],
    ['an int2 as a number', { kind: 'number', type: 'int2' }, '5', 5],
    ['a negative int4', { kind: 'number', type: 'int4' }, '-1', -1],
    ['a float8', { kind: 'number', type: 'float8' }, '1.5', 1.5],
    [
      'an int8 as its text',
      { kind: 'decimal', type: 'int8' },
      '9007199254740993',
      '9007199254740993',
    ],
    [
      'a numeric as its text, before its scale applies',
      { kind: 'decimal', type: 'numeric' },
      '0',
      '0',
    ],
    ['a boolean', { kind: 'boolean' }, 'false', false],
    ['a date', { kind: 'string', type: 'date' }, '2026-01-01', '2026-01-01'],
    [
      'a timestamp, the space a T',
      DATE_TIME,
      '2026-01-01 09:30:00',
      '2026-01-01T09:30:00',
    ],
    [
      'a timestamptz in UTC, the offset a Z',
      INSTANT,
      '2026-01-01 09:30:00.5+00',
      '2026-01-01T09:30:00.5Z',
    ],
    [
      'a jsonb value',
      { kind: 'json', type: 'jsonb' },
      '{"theme": "dark"}',
      { theme: 'dark' },
    ],
  ])('reads the constant of %s', (_, form, literal, value) => {
    expect(attribute(form, literal)).toEqual({ literal, value });
  });

  it('reads an array element by element, a boolean array from its letters', () => {
    expect(attribute(arrayOf({ kind: 'boolean' }), '{t,t,t,t,t,f,f}')).toEqual({
      literal: '{t,t,t,t,t,f,f}',
      value: [true, true, true, true, true, false, false],
    });
    expect(attribute(arrayOf({ kind: 'text', type: 'text' }), '{}')).toEqual({
      literal: '{}',
      value: [],
    });
    expect(
      attribute(arrayOf({ kind: 'text', type: 'text' }), '{"a b","NULL",c}'),
    ).toEqual({ literal: '{"a b","NULL",c}', value: ['a b', 'NULL', 'c'] });
    expect(
      attribute(arrayOf({ kind: 'number', type: 'int2' }), '{1,2}'),
    ).toEqual({ literal: '{1,2}', value: [1, 2] });
  });

  it.each<readonly [string, ValueForm, string | null]>([
    ['an expression such as now()', INSTANT, null],
    ['infinity, which has no read form', INSTANT, 'infinity'],
    ['NaN', { kind: 'number', type: 'float8' }, 'NaN'],
    [
      'an array with a NULL element',
      arrayOf({ kind: 'text', type: 'text' }),
      '{a,NULL}',
    ],
    ['the JSON null', { kind: 'json', type: 'jsonb' }, 'null'],
    [
      "a codec's field, which only its storage codec reads",
      { kind: 'codec', name: 'phone', codec: TEST_REGISTRIES.codecs.phone },
      '+493012345678',
    ],
  ])('gives no value for %s, keeping the literal', (_, form, literal) => {
    expect(attribute(form, literal)).toStrictEqual({
      literal,
      value: undefined,
    });
  });

  it("gives a relationship its id's text, whatever its key's type", () => {
    expect(
      fieldDefault(
        { literal: '5' },
        specOf({ kind: 'number', type: 'int4' }),
        true,
      ),
    ).toEqual({ literal: '5', value: '5' });
    expect(
      fieldDefault({ literal: 'true' }, specOf({ kind: 'boolean' }), true),
    ).toEqual({ literal: 'true', value: 'true' });
    expect(
      fieldDefault(
        { literal: 'free' },
        specOf({ kind: 'enum', type: 'plan_tier' }),
        true,
      ),
    ).toEqual({ literal: 'free', value: 'free' });
    expect(
      fieldDefault(
        { literal: null },
        specOf({ kind: 'number', type: 'int4' }),
        true,
      ),
    ).toStrictEqual({ literal: null, value: undefined });
  });

  it('is frozen through its value, and null without a default', () => {
    const json = attribute({ kind: 'json', type: 'jsonb' }, '{"tags": ["a"]}');
    const value = json?.value as { readonly tags: ReadonlyArray<string> };
    expect(value).toEqual({ tags: ['a'] });
    expect(Object.isFrozen(json)).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.tags)).toBe(true);
    expect(fieldDefault(null, specOf({ kind: 'boolean' }), false)).toBeNull();
  });
});
