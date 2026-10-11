/**
 * A column's type through its domains (SPEC 7.3): the base type, `citext`
 * by its name in any schema, an enum, and an array the column or a domain
 * makes.
 */
import { describe, expect, it } from 'vitest';

import { contactsCatalog } from '../../test-support/contacts';
import { columnType } from './column-type';

describe('columnType', () => {
  it.each([
    [
      'a base type',
      { type: 'int8', typeKind: 'base', array: false },
      { base: 'int8', enum: false, array: false },
    ],
    [
      'a domain over citext',
      { type: 'email', typeKind: 'domain', array: false },
      { base: 'citext', enum: false, array: false },
    ],
    [
      'an array of a domain',
      { type: 'email', typeKind: 'domain', array: true },
      { base: 'citext', enum: false, array: true },
    ],
    [
      'an enum',
      { type: 'contact_kind', typeKind: 'enum', array: false },
      { base: 'contact_kind', enum: true, array: false },
    ],
    [
      'citext in another schema',
      { type: 'extensions.citext', typeKind: 'base', array: false },
      { base: 'citext', enum: false, array: false },
    ],
    [
      'a type that only ends in citext',
      { type: 'mycitext', typeKind: 'base', array: false },
      { base: 'mycitext', enum: false, array: false },
    ],
  ])('reads %s', (_, record, type) => {
    expect(columnType(contactsCatalog, record)).toEqual(type);
  });

  it('refuses a domain the catalog lacks', () => {
    expect(() =>
      columnType(contactsCatalog, {
        type: 'nowhere',
        typeKind: 'domain',
        array: false,
      }),
    ).toThrow(new TypeError('domain nowhere is not in the catalog'));
  });
});
