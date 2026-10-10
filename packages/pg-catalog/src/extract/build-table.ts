/**
 * Builds a `CatalogTable` from its query row (SPEC 2.3 to 2.7).
 * @packageDocumentation
 */
import type {
  CatalogColumn,
  CatalogIndex,
  CatalogTable,
  ColumnGenerated,
  Constraint,
  Policy,
} from '@netvark/catalog-core';

import type {
  ColumnRow,
  ConstraintRow,
  IndexRow,
  PolicyRow,
  TableRow,
} from './rows';

import { compareCodeUnits } from '../internal/code-units';
import {
  GENERATED_KINDS,
  IDENTITIES,
  POLICY_COMMANDS,
  REFERENTIAL_ACTIONS,
  decode,
  decodeOptional,
} from './codes';
import { orderedRecord, referenceName, sortedRecord } from './names';
import { searchConfig } from './search-config';
import {
  defaultMember,
  isBuiltin,
  modifierMembers,
  typeMembers,
} from './type-facts';

/** A member the query fills for this kind of row; its absence is a broken catalog, not a user error. */
function present<TValue>(value: TValue | null, what: string): TValue {
  if (value === null) {
    throw new Error(`pg_catalog returned no ${what}`);
  }
  return value;
}

function generatedMember(
  row: ColumnRow,
  table: string,
): ColumnGenerated | null {
  const kind = decodeOptional(GENERATED_KINDS, row.generated, 'attgenerated');
  if (kind === null) {
    return null;
  }
  const expression = present(
    row.default,
    `generation expression for ${table}.${row.name}`,
  );
  return {
    kind,
    expression,
    searchConfig: isBuiltin(row, 'tsvector') ? searchConfig(expression) : null,
  };
}

function buildColumn(
  row: ColumnRow,
  table: string,
  defaultSchema: string,
): CatalogColumn {
  const generated = generatedMember(row, table);
  return {
    ...typeMembers(row, defaultSchema),
    sqlType: row.sqlType,
    ...modifierMembers(row),
    collation: row.collation,
    nullable: !row.notNull,
    // A generated column's pg_attrdef row holds its generation expression, not a default.
    default: generated === null ? defaultMember(row) : null,
    identity: decodeOptional(IDENTITIES, row.identity, 'attidentity'),
    generated,
    comment: row.comment,
  };
}

function buildForeignKey(
  row: ConstraintRow,
  defaultSchema: string,
): Constraint {
  const schema = present(
    row.referencedSchema,
    `referenced schema of ${row.name}`,
  );
  const table = present(row.referencedTable, `referenced table of ${row.name}`);
  return {
    kind: 'foreignKey',
    columns: row.columns,
    references: {
      table: referenceName(schema, table, defaultSchema),
      columns: row.referencedColumns,
    },
    onUpdate: decode(REFERENTIAL_ACTIONS, row.onUpdate, 'confupdtype'),
    onDelete: decode(REFERENTIAL_ACTIONS, row.onDelete, 'confdeltype'),
    validated: row.validated,
    enforced: row.enforced,
    definition: row.definition,
  };
}

function buildConstraint(
  row: ConstraintRow,
  defaultSchema: string,
): Constraint {
  switch (row.type) {
    case 'p': {
      return {
        kind: 'primaryKey',
        columns: row.columns,
        definition: row.definition,
      };
    }
    case 'u': {
      return {
        kind: 'unique',
        columns: row.columns,
        nullsDistinct: !row.nullsNotDistinct,
        definition: row.definition,
      };
    }
    case 'f': {
      return buildForeignKey(row, defaultSchema);
    }
    case 'c': {
      return {
        kind: 'check',
        columns: row.columns,
        expression: present(row.expression, `expression of ${row.name}`),
        rule: null,
        validated: row.validated,
        enforced: row.enforced,
        definition: row.definition,
      };
    }
    default: {
      return {
        kind: 'exclusion',
        columns: row.columns,
        definition: row.definition,
      };
    }
  }
}

function buildIndex(row: IndexRow): CatalogIndex {
  return {
    method: row.method,
    unique: row.unique,
    primary: row.primary,
    nullsDistinct: !row.nullsNotDistinct,
    columns: row.columns,
    include: row.include,
    predicate: row.predicate,
    definition: row.definition,
  };
}

function buildPolicy(row: PolicyRow): Policy {
  return {
    command: decode(POLICY_COMMANDS, row.command, 'polcmd'),
    permissive: row.permissive,
    roles: row.roles.toSorted((left, right) => compareCodeUnits(left, right)),
    using: row.using,
    withCheck: row.withCheck,
  };
}

/** The table's model; `defaultSchema` names referenced tables and types (SPEC 2.1). */
export function buildTable(row: TableRow, defaultSchema: string): CatalogTable {
  const owner = `table ${referenceName(row.schema, row.name, defaultSchema)}`;
  const constraints = row.constraints.map(
    (constraint) =>
      [constraint.name, buildConstraint(constraint, defaultSchema)] as const,
  );
  const primaryKey = constraints.find(
    ([, constraint]) => constraint.kind === 'primaryKey',
  );
  const columns = row.columns
    .toSorted((left, right) => left.position - right.position)
    .map(
      (column) =>
        [column.name, buildColumn(column, row.name, defaultSchema)] as const,
    );
  return {
    schema: row.schema,
    name: row.name,
    comment: row.comment,
    primaryKey: primaryKey === undefined ? null : primaryKey[1].columns,
    columns: orderedRecord(columns, 'column', owner),
    constraints: sortedRecord(constraints, 'constraint', owner),
    indexes: sortedRecord(
      row.indexes.map((index) => [index.name, buildIndex(index)] as const),
      'index',
      owner,
    ),
    rowSecurity: {
      enabled: row.rowSecurity,
      forced: row.forceRowSecurity,
      policies: sortedRecord(
        row.policies.map(
          (policy) => [policy.name, buildPolicy(policy)] as const,
        ),
        'policy',
        owner,
      ),
    },
  };
}
