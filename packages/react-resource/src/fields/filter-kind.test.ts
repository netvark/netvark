import { describe, expect, it } from 'vitest';

import { Contacts, Organizations } from '../test-support/resources';
import { filterKind, optionValues } from './filter-kind';

describe('filterKind (resource SPEC 20.2)', () => {
  it("names each member's control by the first row of the table that holds, filtered or not", () => {
    const kinds = Object.fromEntries(
      [
        ...Object.values(Contacts.fields),
        ...Object.values(Organizations.fields),
      ].map((meta) => [`${meta.kind} ${meta.name}`, filterKind(meta)]),
    );
    expect(kinds).toEqual({
      'attribute kind': 'options',
      'attribute name': 'text',
      'attribute nickname': 'text',
      'attribute email': 'text',
      'attribute status': 'options',
      'attribute priority': 'number',
      'attribute discount': 'number',
      'attribute lifetimeValue': 'number',
      'attribute score': 'number',
      'attribute tags': 'values',
      'attribute channels': 'options',
      'attribute vip': 'boolean',
      'attribute birthday': 'date',
      'attribute followUpAt': 'date',
      'attribute details': 'text',
      'attribute createdAt': 'date',
      'relationship organization': 'reference',
      'attribute verified': 'boolean',
      'attribute foundedOn': 'date',
      'relationship plan': 'reference',
    });
  });

  it('reads a number from its wire type or from the format of a number that travels as text', () => {
    const facts = ['priority', 'score', 'discount', 'lifetimeValue'].map(
      (name) => {
        const { wire, format } = Contacts.fields[name]!;
        return [name, wire, format];
      },
    );
    expect(facts).toEqual([
      ['priority', 'integer', 'int16'],
      ['score', 'number', 'double'],
      ['discount', 'string', 'decimal'],
      ['lifetimeValue', 'string', 'int64'],
    ]);
  });

  it('reads a date from the formats of date, timestamp, and timestamptz', () => {
    expect(
      ['birthday', 'followUpAt', 'createdAt'].map(
        (name) => Contacts.fields[name]!.format,
      ),
    ).toEqual(['date', 'date-time-local', 'date-time']);
  });

  it("takes an array's element options when the member has none of its own", () => {
    const channels = Contacts.fields['channels']!;
    expect([channels.options, optionValues(channels)]).toEqual([
      null,
      ['email', 'phone', 'post'],
    ]);
    expect(optionValues(Contacts.fields['tags']!)).toBeNull();
  });
});
