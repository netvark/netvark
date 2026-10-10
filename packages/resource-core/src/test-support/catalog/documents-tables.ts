/**
 * A table keyed by a jsonb column and a table with a foreign key to it:
 * PostgreSQL accepts both, since jsonb has a btree operator class, but
 * neither column can carry a resource id. Not published with the package.
 * @ref https://www.postgresql.org/docs/18/datatype-json.html#JSON-INDEXING
 */
export const DOCUMENTS_TABLE = {
  schema: 'public',
  name: 'documents',
  primaryKey: ['id'],
  columns: {
    id: {
      type: 'jsonb',
      typeKind: 'base',
      array: false,
      sqlType: 'jsonb',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    documents_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;

export const DOCUMENT_NOTES_TABLE = {
  schema: 'public',
  name: 'document_notes',
  primaryKey: ['id'],
  columns: {
    id: {
      type: 'uuid',
      typeKind: 'base',
      array: false,
      sqlType: 'uuid',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
    document: {
      type: 'jsonb',
      typeKind: 'base',
      array: false,
      sqlType: 'jsonb',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    document_notes_document_fkey: {
      kind: 'foreignKey',
      columns: ['document'],
      references: {
        table: 'documents',
        columns: ['id'],
      },
    },
    document_notes_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;
