/**
 * Everything a resource's schemas are built from, computed when the
 * resource is declared, so a catalog whose rules do not fit their types
 * fails there; the Zod schemas themselves are built on first use.
 * @packageDocumentation
 */
import type { MemberSpec, SpecSource } from './field-spec';
import type { MultiColumnCheck } from './multi-column';
import type { RelationshipSpec } from './relationship-specs';

import { fieldSpecs, memberSpec } from './field-spec';
import { multiColumnChecks } from './multi-column';
import { relationshipSpecs } from './relationship-specs';

/** The specs of a declared resource's members and its multi-column CHECKs. */
export interface ResourceSpecs {
  /** The primary key, read as a member named `id`, for its keyset type (SPEC 11.2). */
  readonly id: MemberSpec;
  readonly fields: ReadonlyArray<MemberSpec>;
  readonly relationships: ReadonlyArray<RelationshipSpec>;
  readonly checks: ReadonlyArray<MultiColumnCheck>;
}

/** The specs of the resource `source` declares. */
export function resourceSpecs(source: SpecSource): ResourceSpecs {
  return {
    id: memberSpec(source, {
      column: source.names.id,
      name: 'id',
      access: 'read',
    }),
    fields: fieldSpecs(source),
    relationships: relationshipSpecs(source),
    checks: multiColumnChecks(source),
  };
}
