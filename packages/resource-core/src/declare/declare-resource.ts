/**
 * `declareResource` at runtime (SPEC 3, 4, 14): every check TypeScript
 * makes, made again for declarations written in JavaScript, plus those
 * types cannot express; each throws `TypeError` naming the option. The
 * result carries the derived names (`names/derive-names.ts`), the derived
 * error codes (`errors/derive-errors.ts`), the schemas (SPEC 6), and the
 * field metadata (SPEC 8), whose specs are computed here and whose Zod
 * schemas and metadata are built on first read.
 * @packageDocumentation
 */
import type { DefinerContext } from './check-config';
import type { DeclaredResource } from './declared-resource';

import { deriveErrors } from '../errors/derive-errors';
import { lazy } from '../internal/lazy';
import { describe, ownValue } from '../internal/object';
import { fieldMetas } from '../meta/field-meta';
import { deriveNames } from '../names/derive-names';
import {
  attributeSchemas,
  attributeValidators,
} from '../schema/attribute-schemas';
import { checkExamples } from '../schema/examples';
import { linkageSchemas } from '../schema/linkage-schemas';
import { resourceSpecs } from '../schema/resource-specs';
import { writeValidators } from '../schema/write-schemas';
import { checkMembers } from './check-columns';
import {
  checkClientIds,
  checkIdentity,
  checkOperations,
  checkPage,
  checkScope,
  checkSearch,
  checkSort,
} from './check-options';
import { checkRules } from './check-rules';
import { checkDeclarationShape } from './check-shape';
import { brandDeclared } from './declared-resource';
import { freezeDeclaration } from './freeze-declaration';

/** Checks `declaration` over `table` and returns the declared resource. */
export function declareResourceIn(
  context: DefinerContext,
  table: unknown,
  declaration: unknown,
): DeclaredResource {
  if (typeof table !== 'string') {
    throw new TypeError(
      `declareResource: the table must be a string, received ${describe(table)}`,
    );
  }
  const tableDef = ownValue(context.catalog.tables, table);
  if (tableDef === undefined) {
    throw new TypeError(
      `declareResource: "${table}" is not a table of the public catalog`,
    );
  }
  const identity = checkIdentity(context, table, tableDef);
  checkDeclarationShape(table, declaration);
  checkClientIds(table, identity, declaration.clientIds);
  const scopeColumn = checkScope(context, table, tableDef, declaration.scope);
  const operations = checkOperations(table, declaration);
  checkMembers(
    { context, table, tableDef, operations, scopeColumn },
    declaration,
  );
  checkSearch(table, tableDef, declaration);
  checkSort(table, declaration);
  checkPage(context, table, declaration.page);
  checkRules(context, table, tableDef, declaration);
  const names = deriveNames(
    table,
    tableDef,
    { id: identity.id, scopeColumn },
    declaration,
  );
  const frozen = freezeDeclaration(declaration);
  const { errors, origins } = deriveErrors({
    catalog: context.catalog,
    domains: context.domains,
    table,
    tableDef,
    names,
    scopeColumn,
  });
  const specs = resourceSpecs({
    context,
    table,
    tableDef,
    declaration: frozen,
    names,
  });
  checkExamples(table, frozen, specs.fields);
  const schema = lazy(() => attributeSchemas(specs.fields, specs.checks));
  const validate = lazy(() => attributeValidators(specs.fields, schema()));
  const linkage = lazy(() => linkageSchemas(specs.relationships, specs.checks));
  const write = lazy(() => writeValidators(specs, schema(), linkage()));
  const fields = lazy(() =>
    fieldMetas(frozen, specs.fields, specs.relationships),
  );
  return brandDeclared(
    Object.freeze({
      table,
      declaration: frozen,
      names,
      errors,
      get schema() {
        return schema();
      },
      get validate() {
        return validate();
      },
      get linkage() {
        return linkage();
      },
      get write() {
        return write();
      },
      get fields() {
        return fields();
      },
    }),
    { specs, catalog: context.catalog, errorOrigins: origins },
  );
}
