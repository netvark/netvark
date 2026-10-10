import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { namesCatalog } from '../test-support/names';
import { NAME_CASES } from '../test-support/names-cases';

const definers = {
  contacts: untypedDeclare(),
  names: untypedDeclare(namesCatalog),
};

describe('deriveNames: the names of a declared resource (SPEC 4.1, 4.3, 9.1)', () => {
  it.each(NAME_CASES)('$title', ({ catalog, table, declaration, names }) => {
    const resource = definers[catalog](table, declaration);
    expect(resource.names.type).toBe(names.type);
    expect(resource.names.table).toBe(table);
    expect([...resource.names.fields]).toEqual(names.fields);
    expect([...resource.names.relationships]).toEqual(names.relationships);
    expect([...resource.names.columns]).toEqual(
      [...names.fields, ...names.relationships].map(([name, column]) => [
        column,
        name,
      ]),
    );
    expect([...resource.names.codes]).toEqual(names.codes);
    expect([...resource.names.rules]).toEqual(
      names.codes.map(([code, key]) => [key, code]),
    );
  });

  it('names the id by the primary key column and the table by its catalog key', () => {
    const changes = definers.contacts('audit.changes', {
      operations: ['get'],
      fields: {},
    });
    expect(changes.names.id).toBe('id');
    expect(changes.names.table).toBe('audit.changes');
    expect(changes.names.type).toBe('changes');
    const notes = definers.names('notes', { operations: ['get'], fields: {} });
    expect(notes.names.id).toBe('id');
  });

  it('holds the maps in a frozen object, so lookups never meet Object.prototype', () => {
    const resource = definers.names('notes', {
      operations: ['get'],
      fields: { constructor: { access: 'read', as: 'builder' } },
    });
    expect(Object.isFrozen(resource.names)).toBe(true);
    expect(resource.names.fields).toBeInstanceOf(Map);
    expect(resource.names.fields.get('builder')).toBe('constructor');
    expect(resource.names.columns.get('constructor')).toBe('builder');
    expect(resource.names.fields.get('constructor')).toBeUndefined();
    expect(resource.names.fields.has('toString')).toBe(false);
  });

  it('derives a field from a column that is not snake_case unchanged', () => {
    const resource = definers.names('notes', {
      operations: ['get'],
      fields: { bodyText: { access: 'read' } },
    });
    expect([...resource.names.fields]).toEqual([['bodyText', 'bodyText']]);
  });
});
