/**
 * The rows the extraction queries return, as `JSON.parse` reads them. The
 * query text in `queries.ts` fixes these shapes; single-character catalog
 * codes (`contype`, `polcmd`, ...) arrive as one-letter strings, and as
 * `""` where PostgreSQL stores no code.
 * @packageDocumentation
 */

/** The type facts `typeFacts()` in `queries.ts` selects for a column or domain type. */
export interface TypeFactsRow {
  /** `typname` of the type, or of its element type for an array. */
  readonly typeName: string;
  readonly typeSchema: string;
  /** `typtype` of the same type. */
  readonly typeType: string;
  readonly array: boolean;
  /** The type the value is stored as: the type itself, or a domain's base resolved through domains. */
  readonly baseName: string;
  readonly baseSchema: string;
  readonly baseType: string;
  /** `format_type(base, -1)`. */
  readonly baseSpelling: string;
  readonly sqlType: string;
  readonly typmod: number;
  readonly collation: string | null;
  /** `collisdeterministic` of the collation in effect, `null` for a type without one; the recognizer reads it. */
  readonly deterministic: boolean | null;
  readonly default: string | null;
  readonly comment: string | null;
}

export interface EnumRow {
  readonly schema: string;
  readonly name: string;
  readonly labels: ReadonlyArray<string>;
}

interface DomainConstraintRow {
  readonly name: string;
  readonly expression: string;
  readonly validated: boolean;
  readonly definition: string;
}

export interface DomainRow extends TypeFactsRow {
  readonly schema: string;
  readonly name: string;
  readonly notNull: boolean;
  readonly constraints: ReadonlyArray<DomainConstraintRow>;
}

export interface ColumnRow extends TypeFactsRow {
  readonly name: string;
  /** `attnum`. */
  readonly position: number;
  readonly notNull: boolean;
  readonly identity: string;
  readonly generated: string;
}

export interface ConstraintRow {
  readonly name: string;
  readonly type: string;
  readonly columns: ReadonlyArray<string>;
  readonly referencedSchema: string | null;
  readonly referencedTable: string | null;
  readonly referencedColumns: ReadonlyArray<string>;
  readonly onUpdate: string;
  readonly onDelete: string;
  readonly validated: boolean;
  readonly enforced: boolean;
  readonly nullsNotDistinct: boolean;
  readonly expression: string | null;
  readonly definition: string;
}

export interface IndexRow {
  readonly name: string;
  readonly method: string;
  readonly unique: boolean;
  readonly primary: boolean;
  readonly nullsNotDistinct: boolean;
  readonly columns: ReadonlyArray<string | null>;
  readonly include: ReadonlyArray<string>;
  readonly predicate: string | null;
  readonly definition: string;
}

export interface PolicyRow {
  readonly name: string;
  readonly command: string;
  readonly permissive: boolean;
  readonly roles: ReadonlyArray<string>;
  readonly using: string | null;
  readonly withCheck: string | null;
}

export interface TableRow {
  readonly schema: string;
  readonly name: string;
  readonly comment: string | null;
  readonly rowSecurity: boolean;
  readonly forceRowSecurity: boolean;
  readonly columns: ReadonlyArray<ColumnRow>;
  readonly constraints: ReadonlyArray<ConstraintRow>;
  readonly indexes: ReadonlyArray<IndexRow>;
  readonly policies: ReadonlyArray<PolicyRow>;
}
