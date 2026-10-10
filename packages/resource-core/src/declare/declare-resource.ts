/**
 * `declareResource` at runtime (SPEC 3, 4, 14): every check TypeScript
 * makes, made again for declarations written in JavaScript, plus those
 * types cannot express; each throws `TypeError` naming the option. The
 * result carries the derived names (`names/derive-names.ts`).
 * @packageDocumentation
 */
import type { DefinerContext } from './check-config';
import type { DeclaredResource } from './declared-resource';

import { describe, ownValue } from '../internal/object';
import { deriveNames } from '../names/derive-names';
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
  const names = deriveNames(table, tableDef, identity.id, declaration);
  return brandDeclared(
    Object.freeze({
      table,
      declaration: freezeDeclaration(declaration),
      names,
    }),
  );
}
