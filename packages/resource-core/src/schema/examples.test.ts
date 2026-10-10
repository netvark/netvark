import { describe, expect, it } from 'vitest';
import { $ZodError } from 'zod/v4/core';

import { untypedDeclare } from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();

function contacts(fields: object) {
  return declare('contacts', {
    operations: ['get', 'create'],
    scope: 'organization',
    fields,
  });
}

function meetings(example: unknown) {
  return declare('meetings', {
    operations: ['get'],
    fields: { during: { access: 'read', codec: 'range', example } },
  });
}

describe('field examples (SPEC 3, 14)', () => {
  it('accepts an example the field schema accepts, null where the field takes it', () => {
    expect(() =>
      contacts({
        name: { access: 'readWrite', example: 'Ada Lovelace' },
        nickname: { access: 'readWrite', example: null },
        tags: { access: 'readWrite', example: ['vip'] },
        discount: { access: 'readWrite', example: '12.50', as: undefined },
        priority: { access: 'readWrite', example: undefined },
      }),
    ).not.toThrow();
  });

  it('refuses an example the rules, the wire form, or nullability refuse', () => {
    expect(
      typeErrorOf(() =>
        contacts({ name: { access: 'readWrite', example: '' } }),
      ),
    ).toBe(
      'contacts.fields.name.example: the field schema rejects the example',
    );
    expect(
      typeErrorOf(() =>
        contacts({ discount: { access: 'readWrite', example: 12.5 } }),
      ),
    ).toBe(
      'contacts.fields.discount.example: the field schema rejects the example',
    );
    expect(
      typeErrorOf(() =>
        contacts({ name: { access: 'readWrite', example: null } }),
      ),
    ).toBe(
      'contacts.fields.name.example: the field schema rejects the example',
    );
  });

  it('runs the validators on the example, a read field too, since stored values passed them', () => {
    expect(
      typeErrorOf(() =>
        contacts({ email: { access: 'read', example: 'ada.example.com' } }),
      ),
    ).toBe(
      'contacts.fields.email.example: the field schema rejects the example',
    );
  });

  it("checks a codec field's example with the codec schema", () => {
    expect(() =>
      meetings({ start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' }),
    ).not.toThrow();
    expect(typeErrorOf(() => meetings('all day'))).toBe(
      'meetings.fields.during.example: the field schema rejects the example',
    );
  });

  it("carries Zod's error as the cause", () => {
    try {
      contacts({ name: { access: 'readWrite', example: '' } });
    } catch (error) {
      expect((error as TypeError).cause).toBeInstanceOf($ZodError);
      return;
    }
    throw new Error('expected a TypeError');
  });
});
