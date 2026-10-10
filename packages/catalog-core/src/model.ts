/**
 * The catalog model (SPEC 2): what extraction reads from `pg_catalog`, as
 * plain JSON data. Every type is deeply readonly, so a generated
 * `as const` literal is assignable to it, and interfaces list their
 * members in the order the renderer writes them (SPEC 2.10).
 * @packageDocumentation
 */
import type { Rule } from './rules';

/**
 * The format of the catalog files. Any change to the model's shape
 * increments it, so a reader refuses a catalog it does not understand
 * instead of misreading it (ADR 0004).
 */
export const CATALOG_FORMAT = 2;

/** The kind of a column's (or domain's) type: `pg_type.typtype`. */
export type TypeKind =
  | 'base'
  | 'enum'
  | 'domain'
  | 'composite'
  | 'range'
  | 'multirange';

/** `pg_attribute.attidentity`: `GENERATED ALWAYS` or `BY DEFAULT`. */
export type Identity = 'always' | 'byDefault';

/** A column's default expression and, when it is a constant, its text. */
export interface ColumnDefault {
  /** `pg_get_expr(adbin, adrelid)`. */
  readonly expression: string;
  /**
   * The constant's text, set only when the column type's input function
   * turns it into the stored default (SPEC 7.3); `null` for expressions.
   */
  readonly literal: string | null;
}

/** A generated column's expression. */
export interface ColumnGenerated {
  /** `attgenerated` `s`, or `v` from PostgreSQL 18. */
  readonly kind: 'stored' | 'virtual';
  /** `pg_get_expr(adbin, adrelid)`. */
  readonly expression: string;
  /** The text search configuration of a `tsvector` expression (SPEC 7.3). */
  readonly searchConfig: string | null;
}

/** A column (SPEC 2.4). */
export interface CatalogColumn {
  /** The type's reference name; the element type's for an array. */
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  /** `format_type(atttypid, atttypmod)`, such as `character varying(320)`. */
  readonly sqlType: string;
  /** `n` of `varchar(n)` and `char(n)`. */
  readonly maxLength: number | null;
  /**
   * `p` of `numeric(p)` and `numeric(p, s)`, and the fraction digits of a
   * second of `timestamp(p)`, `timestamptz(p)`, `time(p)`, and `timetz(p)`.
   */
  readonly precision: number | null;
  /** `s` of `numeric(p, s)`; `0` for `numeric(p)`. */
  readonly scale: number | null;
  /** An explicit `COLLATE`; `null` for the type's default or none. */
  readonly collation: string | null;
  readonly nullable: boolean;
  readonly default: ColumnDefault | null;
  readonly identity: Identity | null;
  readonly generated: ColumnGenerated | null;
  readonly comment: string | null;
}

/** `pg_constraint.confupdtype` and `confdeltype`. */
export type ReferentialAction =
  | 'noAction'
  | 'restrict'
  | 'cascade'
  | 'setNull'
  | 'setDefault';

/** A primary key constraint. */
export interface PrimaryKeyConstraint {
  readonly kind: 'primaryKey';
  readonly columns: ReadonlyArray<string>;
  /** `pg_get_constraintdef(oid)`. */
  readonly definition: string;
}

/** A unique constraint. */
export interface UniqueConstraint {
  readonly kind: 'unique';
  readonly columns: ReadonlyArray<string>;
  /** `false` for `NULLS NOT DISTINCT` (PostgreSQL 15+). */
  readonly nullsDistinct: boolean;
  readonly definition: string;
}

/** A foreign key constraint. */
export interface ForeignKeyConstraint {
  readonly kind: 'foreignKey';
  readonly columns: ReadonlyArray<string>;
  /** The referenced table's reference name and columns, in key order. */
  readonly references: {
    readonly table: string;
    readonly columns: ReadonlyArray<string>;
  };
  readonly onUpdate: ReferentialAction;
  readonly onDelete: ReferentialAction;
  /** `false` after `NOT VALID` until `VALIDATE CONSTRAINT`. */
  readonly validated: boolean;
  /** `false` for `NOT ENFORCED` (PostgreSQL 18+). */
  readonly enforced: boolean;
  readonly definition: string;
}

/** A check constraint. */
export interface CheckConstraint {
  readonly kind: 'check';
  readonly columns: ReadonlyArray<string>;
  /** `pg_get_expr(conbin, conrelid)`. */
  readonly expression: string;
  /** The rule read from `expression`, or `null` (SPEC 8). */
  readonly rule: Rule | null;
  readonly validated: boolean;
  readonly enforced: boolean;
  readonly definition: string;
}

/** An exclusion constraint. */
export interface ExclusionConstraint {
  readonly kind: 'exclusion';
  /** The plain columns among the elements. */
  readonly columns: ReadonlyArray<string>;
  readonly definition: string;
}

/** A table constraint (SPEC 2.5). NOT NULL lives in `CatalogColumn.nullable`. */
export type Constraint =
  | PrimaryKeyConstraint
  | UniqueConstraint
  | ForeignKeyConstraint
  | CheckConstraint
  | ExclusionConstraint;

/** An index (SPEC 2.6), including those behind constraints. */
export interface CatalogIndex {
  /** `pg_am.amname`: `btree`, `gin`, `gist`, ... */
  readonly method: string;
  readonly unique: boolean;
  readonly primary: boolean;
  readonly nullsDistinct: boolean;
  /** The key columns; `null` for an expression element. */
  readonly columns: ReadonlyArray<string | null>;
  /** The `INCLUDE` columns. */
  readonly include: ReadonlyArray<string>;
  /** `pg_get_expr(indpred, indrelid)`. */
  readonly predicate: string | null;
  /** `pg_get_indexdef(indexrelid)`. */
  readonly definition: string;
}

/** `pg_policy.polcmd`. */
export type PolicyCommand = 'all' | 'select' | 'insert' | 'update' | 'delete';

/** A row security policy (SPEC 2.7). */
export interface Policy {
  readonly command: PolicyCommand;
  readonly permissive: boolean;
  /** Sorted; `public` for the PUBLIC pseudo-role. */
  readonly roles: ReadonlyArray<string>;
  /** `pg_get_expr(polqual, polrelid)`. */
  readonly using: string | null;
  /** `pg_get_expr(polwithcheck, polrelid)`. */
  readonly withCheck: string | null;
}

/** A table's row security. */
export interface RowSecurity {
  /** `relrowsecurity`. */
  readonly enabled: boolean;
  /** `relforcerowsecurity`. */
  readonly forced: boolean;
  readonly policies: Readonly<Record<string, Policy>>;
}

/** An ordinary or partitioned table (SPEC 2.3). */
export interface CatalogTable {
  readonly schema: string;
  readonly name: string;
  readonly comment: string | null;
  /** The primary key constraint's columns. */
  readonly primaryKey: ReadonlyArray<string> | null;
  /** In `attnum` order. */
  readonly columns: Readonly<Record<string, CatalogColumn>>;
  readonly constraints: Readonly<Record<string, Constraint>>;
  readonly indexes: Readonly<Record<string, CatalogIndex>>;
  readonly rowSecurity: RowSecurity;
}

/** A domain's CHECK constraint, written over `VALUE`. */
export interface DomainConstraint {
  readonly kind: 'check';
  readonly expression: string;
  readonly rule: Rule | null;
  readonly validated: boolean;
  readonly definition: string;
}

/** A domain (SPEC 2.8). */
export interface CatalogDomain {
  readonly schema: string;
  readonly name: string;
  /** The base type, as `CatalogColumn.type`. */
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  /** `format_type(typbasetype, typtypmod)`. */
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly collation: string | null;
  /** Not `typnotnull`. */
  readonly nullable: boolean;
  /** `pg_get_expr(typdefaultbin, 0)`. */
  readonly default: ColumnDefault | null;
  readonly constraints: Readonly<Record<string, DomainConstraint>>;
  readonly comment: string | null;
}

/** Everything extraction read from the configured schemas (SPEC 2.2). */
export interface Catalog {
  readonly format: typeof CATALOG_FORMAT;
  /** The configured schemas, in order; the first is the default schema. */
  readonly schemas: ReadonlyArray<string>;
  /** Extensions installed into a configured schema, sorted. */
  readonly extensions: ReadonlyArray<string>;
  /** Labels in declaration order. */
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly domains: Readonly<Record<string, CatalogDomain>>;
  readonly tables: Readonly<Record<string, CatalogTable>>;
}
