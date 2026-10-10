/**
 * `boundaryFixtures` (SPEC 15.3): the generated values an oracle runs
 * through a declared resource's schemas and through PostgreSQL, whose
 * verdicts must agree, or PostgreSQL must store a value the read form does
 * not give back as sent. Each bound and its neighbors, the type's limits,
 * empty and astral strings, U+0000, an unpaired surrogate, the fraction
 * digits a date-time keeps and one more, and the date limits.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { MemberSpec } from '../schema/field-spec';
import type { ValueSpec } from '../schema/value-form';
import type { BoundaryFixture } from './fixture';

import { internalsOf } from '../declare/declared-resource';
import { idFixtures } from './id-boundaries';
import { valueFixtures } from './value-boundaries';

type Fixtures = Readonly<Record<string, ReadonlyArray<BoundaryFixture>>>;

/** The boundary fixtures of a declared resource's members, by public name. */
export interface ResourceBoundaries {
  /** Each field with a wire form; a codec field has no entry, since its codec's fixtures cover it (SPEC 7.1). */
  readonly fields: Fixtures;
  /** Each relationship's ids, which a linkage carries as `id` (SPEC 3.4). */
  readonly relationships: Fixtures;
}

/** Each member's fixtures under its public name, frozen. */
function byName(
  members: ReadonlyArray<MemberSpec>,
  build: (value: ValueSpec) => ReadonlyArray<BoundaryFixture>,
): Fixtures {
  const entries = members.map(
    (member): readonly [string, ReadonlyArray<BoundaryFixture>] => [
      member.name,
      Object.freeze(build(member.value)),
    ],
  );
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * The boundary fixtures of every field and relationship of `resource`.
 * Throws `TypeError` for a value `declareResource` did not return.
 */
export function boundaryFixtures(
  resource: DeclaredResource,
): ResourceBoundaries {
  const internals = internalsOf(resource);
  if (internals === undefined) {
    throw new TypeError(
      'boundaryFixtures: the resource must be one declareResource returned',
    );
  }
  const { specs, catalog } = internals;
  const fields = specs.fields.filter(
    (field) => field.value.form.kind !== 'codec',
  );
  return Object.freeze({
    fields: byName(fields, (value) => valueFixtures(value, catalog)),
    relationships: byName(specs.relationships, (value) =>
      idFixtures(value, catalog),
    ),
  });
}
