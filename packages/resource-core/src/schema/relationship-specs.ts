/**
 * The spec of each declared relationship (SPEC 3.8, 6.2): its foreign-key
 * column's value, nullability, and requirement, as for a field, and its
 * target, read on first use. A target is read only once every module has
 * loaded, never while declaring, so declarations may reference each other;
 * the first read checks that it is the declared resource of the table the
 * foreign key references.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { RelationshipDeclaration } from '../declare/types';
import type { MemberSpec, SpecSource } from './field-spec';

import { foreignKeyOf } from '../catalog/columns';
import { isDeclaredResource } from '../declare/declared-resource';
import { lazy } from '../internal/lazy';
import { memberSpec } from './field-spec';

/** A relationship's member spec, the table its foreign key references, and its target. */
export interface RelationshipSpec extends MemberSpec {
  readonly references: string;
  /** The target's declared resource, checked and kept on first read. */
  readonly target: () => DeclaredResource;
}

/** Reads a target once it succeeds; a failed read throws again on the next. */
function targetReader(
  path: string,
  references: string,
  target: () => unknown,
): () => DeclaredResource {
  return lazy(() => {
    const resource = target();
    if (!isDeclaredResource(resource)) {
      throw new TypeError(
        `${path}: must return the declared resource of ${references}`,
      );
    }
    if (resource.table !== references) {
      throw new TypeError(
        `${path}: the target is a resource of ${resource.table}; the foreign key references ${references}`,
      );
    }
    return resource;
  });
}

function relationshipSpec(
  source: SpecSource,
  column: string,
  relationship: RelationshipDeclaration,
): RelationshipSpec {
  const path = `${source.table}.relationships.${column}`;
  const foreignKey = foreignKeyOf(source.tableDef, column);
  if (foreignKey === undefined) {
    throw new TypeError(`${path}: not a single-column foreign key`);
  }
  const references = foreignKey.references.table;
  return {
    ...memberSpec(source, {
      column,
      name: source.names.columns.get(column) ?? column,
      access: relationship.access,
    }),
    references,
    target: targetReader(`${path}.target`, references, relationship.target),
  };
}

/** The spec of every declared relationship, in declaration order. */
export function relationshipSpecs(
  source: SpecSource,
): ReadonlyArray<RelationshipSpec> {
  return Object.entries(source.declaration.relationships ?? {}).map(
    ([column, relationship]) => relationshipSpec(source, column, relationship),
  );
}
