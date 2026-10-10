/** A lookup table keyed by a stored generated column (`slug text generated always as (lower(label)) stored primary key`), which takes no client value. Not published with the package. */
export const TAGS_TABLE = {
  schema: 'public',
  name: 'tags',
  primaryKey: ['slug'],
  columns: {
    label: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
    slug: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: {
        kind: 'stored',
        searchConfig: null,
      },
    },
  },
  constraints: {
    tags_pkey: {
      kind: 'primaryKey',
      columns: ['slug'],
    },
  },
} as const;
