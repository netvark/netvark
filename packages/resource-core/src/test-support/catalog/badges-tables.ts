/**
 * A table keyed by a `char(6)` and a table with a `char(4)` foreign key to
 * it: PostgreSQL takes the foreign key, since both are `bpchar`, but pads
 * the same value to four characters in one and six in the other, so the
 * foreign key cannot spell its target's ids. Not published with the
 * package.
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 */
export const BADGES_TABLE = {
  schema: 'public',
  name: 'badges',
  primaryKey: ['code'],
  columns: {
    code: {
      type: 'bpchar',
      typeKind: 'base',
      array: false,
      sqlType: 'character(6)',
      maxLength: 6,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    badges_pkey: {
      kind: 'primaryKey',
      columns: ['code'],
    },
  },
} as const;

export const BADGE_AWARDS_TABLE = {
  schema: 'public',
  name: 'badge_awards',
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
    badge_id: {
      type: 'bpchar',
      typeKind: 'base',
      array: false,
      sqlType: 'character(4)',
      maxLength: 4,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    badge_awards_badge_id_fkey: {
      kind: 'foreignKey',
      columns: ['badge_id'],
      references: {
        table: 'badges',
        columns: ['code'],
      },
      enforced: true,
    },
    badge_awards_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;
