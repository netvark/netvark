/**
 * The public catalog's types (SPEC 3, ADR 0005): the slice of the catalog a
 * browser may see. Each is the full type without the members a form does
 * not need: expressions, definitions, comments, collations, indexes, and
 * row security. A unique index that no constraint backs appears among the
 * constraints as a unique constraint (ADR 0009).
 * @packageDocumentation
 */
import type { CATALOG_FORMAT, Identity, TypeKind } from './model';
import type { Rule } from './rules';

/** A default without its expression: a client may omit the column. */
export interface PublicColumnDefault {
  readonly literal: string | null;
}

/** A generated column without its expression. */
export interface PublicColumnGenerated {
  readonly kind: 'stored' | 'virtual';
  readonly searchConfig: string | null;
}

/** A column of a public table. */
export interface PublicColumn {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly nullable: boolean;
  readonly default: PublicColumnDefault | null;
  readonly identity: Identity | null;
  readonly generated: PublicColumnGenerated | null;
}

/** A primary key, without its definition. */
export interface PublicPrimaryKeyConstraint {
  readonly kind: 'primaryKey';
  readonly columns: ReadonlyArray<string>;
}

/**
 * A unique constraint, or a unique index that no constraint backs (ADR
 * 0009), without its definition.
 */
export interface PublicUniqueConstraint {
  readonly kind: 'unique';
  readonly columns: ReadonlyArray<string>;
  readonly nullsDistinct: boolean;
  /**
   * Whether a predicate limits uniqueness to some rows, as the `WHERE`
   * clause of a partial unique index does. The predicate is an expression,
   * so it stays private; a UNIQUE constraint is never partial.
   * @ref https://www.postgresql.org/docs/18/indexes-partial.html
   */
  readonly partial: boolean;
}

/** A foreign key, without its actions, validation state, or definition. */
export interface PublicForeignKeyConstraint {
  readonly kind: 'foreignKey';
  readonly columns: ReadonlyArray<string>;
  readonly references: {
    readonly table: string;
    readonly columns: ReadonlyArray<string>;
  };
  /** False for NOT ENFORCED (PostgreSQL 18), which the database never checks (ADR 0010). */
  readonly enforced: boolean;
}

/** A check constraint: its rule, never its expression. */
export interface PublicCheckConstraint {
  readonly kind: 'check';
  readonly columns: ReadonlyArray<string>;
  readonly rule: Rule | null;
  /**
   * False for NOT ENFORCED (PostgreSQL 18), which the database never
   * checks, so its `rule` is `null` (ADR 0006, 0010).
   * @ref https://www.postgresql.org/docs/18/sql-createtable.html (`NOT ENFORCED`)
   */
  readonly enforced: boolean;
}

/** An exclusion constraint, without its definition. */
export interface PublicExclusionConstraint {
  readonly kind: 'exclusion';
  readonly columns: ReadonlyArray<string>;
}

/** A constraint of a public table. */
export type PublicConstraint =
  | PublicPrimaryKeyConstraint
  | PublicUniqueConstraint
  | PublicForeignKeyConstraint
  | PublicCheckConstraint
  | PublicExclusionConstraint;

/** A public table. */
export interface PublicTable {
  readonly schema: string;
  readonly name: string;
  readonly primaryKey: ReadonlyArray<string> | null;
  readonly columns: Readonly<Record<string, PublicColumn>>;
  readonly constraints: Readonly<Record<string, PublicConstraint>>;
}

/** A domain's constraint: its rule only. */
export interface PublicDomainConstraint {
  readonly kind: 'check';
  readonly rule: Rule | null;
}

/** A domain a public column uses. */
export interface PublicDomain {
  readonly schema: string;
  readonly name: string;
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly nullable: boolean;
  readonly default: PublicColumnDefault | null;
  readonly constraints: Readonly<Record<string, PublicDomainConstraint>>;
}

/** The browser-safe slice of a catalog. */
export interface PublicCatalog {
  readonly format: typeof CATALOG_FORMAT;
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly domains: Readonly<Record<string, PublicDomain>>;
  readonly tables: Readonly<Record<string, PublicTable>>;
}
