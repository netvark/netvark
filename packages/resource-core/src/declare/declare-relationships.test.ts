import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();
const read = { target: () => null, access: 'read' };

const relationship =
  (
    target: string,
    operations: ReadonlyArray<string>,
    key: string,
    value: unknown,
  ) =>
  () =>
    declare(target, {
      operations,
      fields: {},
      relationships: { [key]: value },
    });

/** A scoped declaration that tries to write its scope column. */
const writeScopeColumn = () =>
  declare('contacts', {
    operations: ['create'],
    scope: 'organization',
    fields: { name: { access: 'immutable' } },
    relationships: {
      organization_id: { target: () => null, access: 'immutable' },
    },
  });

describe('declareResource: relationships (SPEC 3.1)', () => {
  it('refuses a column that is not a single-column foreign key, and the primary key', () => {
    expect(typeErrorOf(relationship('contacts', ['get'], 'name', read))).toBe(
      'contacts.relationships.name: "name" is not the column of a single-column foreign key',
    );
    expect(typeErrorOf(relationship('contacts', ['get'], 'id', read))).toBe(
      'contacts.relationships.id: the primary key is the resource id',
    );
    expect(
      typeErrorOf(relationship('contacts', ['get'], 'owner_id', read)),
    ).toBe(
      'contacts.relationships.owner_id: "owner_id" is not a column of contacts',
    );
  });

  it('refuses a foreign key to a column other than the primary key, or to a table outside the catalog', () => {
    expect(
      typeErrorOf(relationship('people', ['get'], 'team_slug', read)),
    ).toBe(
      'people.relationships.team_slug: the foreign key references teams.slug, which is not its primary key',
    );
    const partial = untypedDeclare(
      catalogOf({
        notes: table(
          'notes',
          { id: column({ type: 'uuid' }), author_id: column({ type: 'uuid' }) },
          {
            notes_author_id_fkey: {
              kind: 'foreignKey',
              columns: ['author_id'],
              references: { table: 'users', columns: ['id'] },
            },
          },
        ),
      }),
    );
    expect(
      typeErrorOf(() =>
        partial('notes', {
          operations: ['get'],
          fields: {},
          relationships: { author_id: read },
        }),
      ),
    ).toBe(
      'notes.relationships.author_id: the foreign key references users, which is not a table of the public catalog',
    );
  });

  it('refuses a foreign key whose type cannot carry a resource id (SPEC 3.4)', () => {
    // PostgreSQL accepts a jsonb primary key and a foreign key to it, since
    // jsonb has a btree operator class; neither has an id form.
    // @ref https://www.postgresql.org/docs/18/datatype-json.html#JSON-INDEXING
    const jsonb = column({ type: 'jsonb', sqlType: 'jsonb' });
    const documents = untypedDeclare(
      catalogOf({
        documents: table('documents', { id: jsonb }),
        notes: table(
          'notes',
          { id: column({ type: 'uuid' }), document: jsonb },
          {
            notes_document_fkey: {
              kind: 'foreignKey',
              columns: ['document'],
              references: { table: 'documents', columns: ['id'] },
            },
          },
        ),
      }),
    );
    expect(
      typeErrorOf(() =>
        documents('notes', {
          operations: ['get'],
          fields: {},
          relationships: { document: read },
        }),
      ),
    ).toBe(
      'notes.relationships.document: type jsonb cannot carry a resource id',
    );
  });

  it('keeps the scope column read-only and checks access against the operations', () => {
    expect(typeErrorOf(writeScopeColumn)).toBe(
      'contacts.relationships.organization_id.access: the scope column is read-only',
    );
    expect(
      typeErrorOf(
        relationship('meetings', ['get'], 'follow_up_of_id', {
          target: () => null,
          access: 'readWrite',
        }),
      ),
    ).toBe(
      'meetings.relationships.follow_up_of_id.access: readWrite needs the create or update operation',
    );
  });
});
