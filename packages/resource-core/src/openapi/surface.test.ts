import { describe, expect, it } from 'vitest';

import { Contacts, Organizations } from '../test-support/definition-resources';
import { surfaceOf } from './surface';

function isSorted(values: ReadonlyArray<string>): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1]! < value,
  );
}

const NO_LIMITS = {
  minLength: null,
  maxLength: null,
  minimum: null,
  exclusiveMinimum: null,
  maximum: null,
  exclusiveMaximum: null,
  multipleOf: null,
  patterns: [],
};

describe('surfaceOf', () => {
  const surface = surfaceOf([Organizations, Contacts]);
  const contacts = surface.resources['contacts']!;

  it('is a JSON value, its maps and unordered lists sorted, that does not depend on the order of the registry', () => {
    expect(JSON.parse(JSON.stringify(surface))).toEqual(surface);
    expect(JSON.stringify(surfaceOf([Contacts, Organizations]))).toBe(
      JSON.stringify(surface),
    );
    const maps = Object.values(surface.resources).flatMap((resource) => [
      resource.fields,
      resource.relationships,
      resource.codes,
    ]);
    for (const map of [surface.resources, ...maps]) {
      expect(isSorted(Object.keys(map))).toBe(true);
    }
    const resources = Object.values(surface.resources);
    const fields = resources.flatMap((resource) =>
      Object.values(resource.fields),
    );
    const lists = [
      ...resources.map((resource) => resource.operations),
      ...fields.map((field) => field.operators),
      ...fields.map((field) => field.limits.patterns),
    ];
    for (const list of lists) {
      expect(isSorted(list)).toBe(true);
    }
  });

  it('records the operations, search, page, and codes of a type', () => {
    expect(contacts.operations).toEqual(['create', 'get', 'list', 'update']);
    expect(contacts.search).toBe('filter[q]');
    expect(contacts.page).toEqual({ default: 25, max: 50, range: false });
    expect(contacts.codes).toMatchObject({
      CONTACTS_EMAIL_UNIQUE: 409,
      CONTACTS_ORGANIZATION_ID_FKEY: 404,
      CONTACTS_NAME_CHECK: 422,
    });
    expect(surface.resources['organizations']).toMatchObject({
      operations: ['get', 'list'],
      relationships: {},
      search: null,
    });
  });

  it('records what a client sends and reads of a field', () => {
    expect(contacts.fields['name']).toEqual({
      wire: 'string',
      format: null,
      fractionDigits: null,
      limits: { ...NO_LIMITS, minLength: 1, maxLength: 200 },
      options: null,
      access: 'readWrite',
      nullable: false,
      required: true,
      items: null,
      codec: null,
      operators: ['eq', 'startsWithi'],
      sortable: true,
    });
    expect(contacts.fields['kind']).toMatchObject({
      access: 'immutable',
      options: ['person', 'company'],
      operators: ['eq', 'in'],
    });
    expect(contacts.fields['createdAt']).toMatchObject({
      access: 'read',
      format: 'date-time',
      fractionDigits: 6,
      operators: ['gte', 'lt'],
    });
    expect(contacts.fields['priority']?.limits).toEqual({
      ...NO_LIMITS,
      minimum: '1',
      maximum: '5',
    });
    expect(contacts.fields['tags']).toMatchObject({
      wire: 'array',
      items: { wire: 'string', limits: NO_LIMITS, options: null },
    });
  });

  it('records the target, access, requiredness, operators, and include of a relationship', () => {
    expect(contacts.relationships).toEqual({
      organization: {
        target: 'organizations',
        access: 'readWrite',
        nullable: false,
        required: true,
        operators: ['eq', 'in'],
        include: true,
      },
    });
  });

  it('refuses a registry the checks refuse', () => {
    expect(() => surfaceOf([Contacts])).toThrow(TypeError);
    expect(() => surfaceOf([{} as never])).toThrow(
      /^surfaceOf\.resources\[0\]: must be a resource declareResource returned$/u,
    );
  });
});
