/**
 * `toPublicCatalog` (SPEC 3, ADR 0005): the slice of a catalog a browser
 * may see, a pure function of the catalog and the configured table list.
 * @packageDocumentation
 */
import type {
  Catalog,
  CatalogColumn,
  CatalogDomain,
  CatalogTable,
  ColumnDefault,
  Constraint,
  TypeKind,
} from './model';
import type {
  PublicCatalog,
  PublicColumn,
  PublicColumnDefault,
  PublicConstraint,
  PublicDomain,
  PublicTable,
} from './public-types';

import { CATALOG_FORMAT } from './model';

function mapValues<TIn, TOut>(
  record: Readonly<Record<string, TIn>>,
  map: (value: TIn) => TOut,
): Record<string, TOut> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, map(value)]),
  );
}

function publicDefault(
  value: ColumnDefault | null,
): PublicColumnDefault | null {
  return value === null ? null : { literal: value.literal };
}

function publicColumn(column: CatalogColumn): PublicColumn {
  return {
    type: column.type,
    typeKind: column.typeKind,
    array: column.array,
    sqlType: column.sqlType,
    maxLength: column.maxLength,
    precision: column.precision,
    scale: column.scale,
    nullable: column.nullable,
    default: publicDefault(column.default),
    identity: column.identity,
    generated:
      column.generated === null
        ? null
        : {
            kind: column.generated.kind,
            searchConfig: column.generated.searchConfig,
          },
  };
}

/** The constraint kinds are closed; another one means a hand-edited or newer catalog. */
function unreachable(constraint: never): never {
  throw new TypeError(`unknown constraint kind: ${JSON.stringify(constraint)}`);
}

function publicConstraint(constraint: Constraint): PublicConstraint {
  switch (constraint.kind) {
    case 'primaryKey':
    case 'exclusion': {
      return { kind: constraint.kind, columns: constraint.columns };
    }
    case 'unique': {
      return {
        kind: 'unique',
        columns: constraint.columns,
        nullsDistinct: constraint.nullsDistinct,
      };
    }
    case 'foreignKey': {
      const { table, columns } = constraint.references;
      return {
        kind: 'foreignKey',
        columns: constraint.columns,
        references: { table, columns },
      };
    }
    case 'check': {
      return {
        kind: 'check',
        columns: constraint.columns,
        rule: constraint.rule,
      };
    }
    default: {
      return unreachable(constraint);
    }
  }
}

function publicTable(table: CatalogTable): PublicTable {
  return {
    schema: table.schema,
    name: table.name,
    primaryKey: table.primaryKey,
    columns: mapValues(table.columns, publicColumn),
    constraints: mapValues(table.constraints, publicConstraint),
  };
}

function publicDomain(domain: CatalogDomain): PublicDomain {
  return {
    schema: domain.schema,
    name: domain.name,
    type: domain.type,
    typeKind: domain.typeKind,
    array: domain.array,
    sqlType: domain.sqlType,
    maxLength: domain.maxLength,
    precision: domain.precision,
    scale: domain.scale,
    nullable: domain.nullable,
    default: publicDefault(domain.default),
    constraints: mapValues(domain.constraints, (constraint) => ({
      kind: constraint.kind,
      rule: constraint.rule,
    })),
  };
}

function wantedTables(
  catalog: Catalog,
  tables: ReadonlyArray<string>,
): ReadonlySet<string> {
  const wanted = new Set<string>();
  for (const table of tables) {
    if (!Object.hasOwn(catalog.tables, table)) {
      throw new TypeError(`public table "${table}" is not in the catalog`);
    }
    if (wanted.has(table)) {
      throw new TypeError(`public table "${table}" is listed twice`);
    }
    wanted.add(table);
  }
  return wanted;
}

/**
 * The enums and domains the kept columns use, directly or through a kept
 * domain's base type, recursively. Membership is decided by the type kind,
 * since a reference name alone can be a base type's (`text`) as well.
 */
function usedTypes(
  catalog: Catalog,
  columns: ReadonlyArray<{
    readonly type: string;
    readonly typeKind: TypeKind;
  }>,
): {
  readonly enums: ReadonlySet<string>;
  readonly domains: ReadonlySet<string>;
} {
  const enums = new Set<string>();
  const domains = new Set<string>();
  const pending = [...columns];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.typeKind === 'enum') {
      enums.add(next.type);
    } else if (next.typeKind === 'domain' && !domains.has(next.type)) {
      domains.add(next.type);
      const domain = catalog.domains[next.type];
      if (domain !== undefined) {
        pending.push(domain);
      }
    }
  }
  return { enums, domains };
}

/**
 * The public catalog: the listed tables, in the catalog's order, with only
 * the facts a form needs, and the enums and domains their columns use.
 * Throws `TypeError` for a table the catalog does not hold or one listed
 * twice.
 */
export function toPublicCatalog(
  catalog: Catalog,
  tables: ReadonlyArray<string>,
): PublicCatalog {
  const wanted = wantedTables(catalog, tables);
  const kept = Object.entries(catalog.tables).filter(([key]) =>
    wanted.has(key),
  );
  const used = usedTypes(
    catalog,
    kept.flatMap(([, table]) => Object.values(table.columns)),
  );
  return {
    format: CATALOG_FORMAT,
    enums: Object.fromEntries(
      Object.entries(catalog.enums).filter(([key]) => used.enums.has(key)),
    ),
    domains: Object.fromEntries(
      Object.entries(catalog.domains)
        .filter(([key]) => used.domains.has(key))
        .map(([key, domain]) => [key, publicDomain(domain)]),
    ),
    tables: Object.fromEntries(
      kept.map(([key, table]) => [key, publicTable(table)]),
    ),
  };
}
