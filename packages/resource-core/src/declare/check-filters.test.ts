import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();
const fields = (target: string, value: unknown) => () =>
  declare(target, { operations: ['get'], fields: value });
const relationships = (target: string, value: unknown) => () =>
  declare(target, { operations: ['get'], fields: {}, relationships: value });

describe('declareResource: filter and sort against the operator table (SPEC 11.3)', () => {
  it('accepts every operator each keyset type takes, and sort on scalars', () => {
    expect(
      fields('contacts', {
        name: {
          access: 'read',
          sort: true,
          filter: [
            'eq',
            'ne',
            'in',
            'nin',
            'gt',
            'gte',
            'lt',
            'lte',
            'between',
          ],
        },
        nickname: {
          access: 'read',
          filter: [
            'contains',
            'startsWith',
            'endsWith',
            'eqi',
            'containsi',
            'startsWithi',
            'endsWithi',
            'isNull',
          ],
        },
        email: { access: 'read', sort: true, filter: ['eqi', 'isNull'] },
        kind: { access: 'read', sort: true, filter: ['eq', 'ne', 'in', 'nin'] },
        status: { access: 'read', filter: ['in'] },
        priority: { access: 'read', sort: true, filter: ['between', 'isNull'] },
        discount: { access: 'read', filter: ['gte', 'lte'] },
        tags: {
          access: 'read',
          filter: ['contains', 'containedBy', 'overlaps'],
        },
        created_at: { access: 'read', sort: true, filter: [] },
      }),
    ).not.toThrow();
    expect(
      relationships('meetings', {
        contact_id: {
          target: () => null,
          access: 'read',
          filter: ['eq', 'in', 'isNull'],
        },
      }),
    ).not.toThrow();
  });

  it('refuses an operator the keyset type does not take', () => {
    expect(
      typeErrorOf(
        fields('contacts', { tags: { access: 'read', filter: ['gt'] } }),
      ),
    ).toBe(
      'contacts.fields.tags.filter: operator "gt" is not available for array fields',
    );
    expect(
      typeErrorOf(
        fields('contacts', {
          kind: { access: 'read', filter: ['eq', 'contains'] },
        }),
      ),
    ).toBe(
      'contacts.fields.kind.filter: operator "contains" is not available for enum fields',
    );
    expect(
      typeErrorOf(
        fields('contacts', { status: { access: 'read', filter: ['gt'] } }),
      ),
    ).toBe(
      'contacts.fields.status.filter: operator "gt" is not available for enum fields',
    );
    expect(
      typeErrorOf(
        fields('contacts', {
          priority: { access: 'read', filter: ['startsWith'] },
        }),
      ),
    ).toBe(
      'contacts.fields.priority.filter: operator "startsWith" is not available for integer fields',
    );
  });

  it('refuses isNull on a field that cannot be null, by its effective nullability', () => {
    expect(
      typeErrorOf(
        fields('contacts', { name: { access: 'read', filter: ['isNull'] } }),
      ),
    ).toBe(
      'contacts.fields.name.filter: operator "isNull" is not available for non-null fields',
    );
    expect(
      typeErrorOf(
        fields('meetings', {
          notes: { access: 'read', filter: ['eq', 'isNull'] },
        }),
      ),
    ).toBe(
      'meetings.fields.notes.filter: operator "isNull" is not available for non-null fields',
    );
  });

  it('refuses filter and sort on a member without a keyset type', () => {
    expect(
      typeErrorOf(
        fields('audit.changes', { payload: { access: 'read', filter: [] } }),
      ),
    ).toBe('audit.changes.fields.payload.filter: type jsonb is not filterable');
    expect(
      typeErrorOf(
        fields('audit.changes', { payload: { access: 'read', sort: true } }),
      ),
    ).toBe('audit.changes.fields.payload.sort: type jsonb is not sortable');
    expect(
      typeErrorOf(
        fields('meetings', {
          during: { access: 'read', codec: 'range', filter: ['eq'] },
        }),
      ),
    ).toBe('meetings.fields.during.filter: a codec field is not filterable');
    expect(
      typeErrorOf(
        fields('contacts', {
          website: { access: 'read', codec: 'phone', sort: true },
        }),
      ),
    ).toBe('contacts.fields.website.sort: a codec field is not sortable');
  });

  it('refuses sort on an array, and an array of enum values or an enum without values entirely', () => {
    expect(
      typeErrorOf(fields('contacts', { tags: { access: 'read', sort: true } })),
    ).toBe('contacts.fields.tags.sort: an array field is not sortable');
    const things = untypedDeclare({
      ...catalogOf({
        things: table('things', {
          id: column({ type: 'uuid', nullable: false }),
          moods: column({ type: 'mood', typeKind: 'enum', array: true }),
          nothing: column({ type: 'void_kind', typeKind: 'enum' }),
        }),
      }),
      enums: { mood: ['calm', 'tense'], void_kind: [] },
    });
    const declareThings = (value: unknown) => () =>
      things('things', { operations: ['get'], fields: value });
    expect(
      typeErrorOf(
        declareThings({ moods: { access: 'read', filter: ['contains'] } }),
      ),
    ).toBe(
      'things.fields.moods.filter: an array of enum values is not filterable',
    );
    expect(
      typeErrorOf(declareThings({ nothing: { access: 'read', sort: true } })),
    ).toBe(
      'things.fields.nothing.sort: an enum without values is not sortable',
    );
  });

  it('checks a relationship by its foreign-key column', () => {
    expect(
      typeErrorOf(
        relationships('contacts', {
          organization_id: {
            target: () => null,
            access: 'read',
            filter: ['eq', 'isNull'],
          },
        }),
      ),
    ).toBe(
      'contacts.relationships.organization_id.filter: operator "isNull" is not available for non-null fields',
    );
    const switches = untypedDeclare(
      catalogOf({
        switches: table('switches', {
          id: column({ type: 'bool', nullable: false }),
        }),
        lamps: table(
          'lamps',
          {
            id: column({ type: 'uuid', nullable: false }),
            switch_id: column({ type: 'bool' }),
          },
          {
            lamps_switch_id_fkey: {
              kind: 'foreignKey',
              columns: ['switch_id'],
              references: { table: 'switches', columns: ['id'] },
              enforced: true,
            },
          },
        ),
      }),
    );
    expect(
      typeErrorOf(() =>
        switches('lamps', {
          operations: ['get'],
          fields: {},
          relationships: {
            switch_id: { target: () => null, access: 'read', filter: ['in'] },
          },
        }),
      ),
    ).toBe(
      'lamps.relationships.switch_id.filter: operator "in" is not available for boolean fields',
    );
  });
});
