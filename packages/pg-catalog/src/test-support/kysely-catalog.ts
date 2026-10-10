/**
 * Small hand-built catalogs for the Kysely renderer's edge cases: name
 * collisions, overrides, and domains the test schema cannot express.
 */
import type {
  Catalog,
  CatalogColumn,
  CatalogDomain,
  CatalogTable,
} from '@netvark/catalog-core';

import { CATALOG_FORMAT } from '@netvark/catalog-core';

/** A nullable base-type column without a default; `facts` replaces any member. */
export function column(
  type: string,
  facts: Partial<CatalogColumn> = {},
): CatalogColumn {
  return {
    type,
    typeKind: 'base',
    array: false,
    sqlType: type,
    maxLength: null,
    precision: null,
    scale: null,
    collation: null,
    nullable: true,
    default: null,
    identity: null,
    generated: null,
    comment: null,
    ...facts,
  };
}

/** A nullable domain over the base type `type`; `facts` replaces any member. */
export function domain(
  name: string,
  type: string,
  facts: Partial<CatalogDomain> = {},
): CatalogDomain {
  return {
    schema: 'public',
    name,
    type,
    typeKind: 'base',
    array: false,
    sqlType: type,
    maxLength: null,
    precision: null,
    scale: null,
    collation: null,
    nullable: true,
    default: null,
    constraints: {},
    comment: null,
    ...facts,
  };
}

/** A table of `columns` with no constraints, indexes, or policies. */
export function table(
  name: string,
  columns: Readonly<Record<string, CatalogColumn>>,
): CatalogTable {
  return {
    schema: 'public',
    name,
    comment: null,
    primaryKey: null,
    columns,
    constraints: {},
    indexes: {},
    rowSecurity: { enabled: false, forced: false, policies: {} },
  };
}

/** A catalog of the given enums, domains, and tables. */
export function catalogOf(parts: {
  readonly enums?: Catalog['enums'];
  readonly domains?: Catalog['domains'];
  readonly tables?: Catalog['tables'];
}): Catalog {
  return {
    format: CATALOG_FORMAT,
    schemas: ['public'],
    extensions: [],
    enums: parts.enums ?? {},
    domains: parts.domains ?? {},
    tables: parts.tables ?? {},
  };
}
