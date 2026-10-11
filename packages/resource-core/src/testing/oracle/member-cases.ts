/**
 * The cases of a resource's members (SPEC 7.3, 15.3): each field with a
 * wire form and each relationship a client writes, its boundary fixtures
 * written into a copy of its column that holds the CHECKs its schema
 * enforces. The write schema's verdict and the database's must agree, and
 * every value the database stores must read as a value a field's read
 * schema accepts.
 * @packageDocumentation
 */
import type { $ZodType } from 'zod/v4/core';

import type { DeclaredInternals } from '../../declare/declared-resource';
import type { MemberSpec } from '../../schema/field-spec';
import type { RelationshipSpec } from '../../schema/relationship-specs';
import type { BoundaryFixture } from '../fixture';
import type { ColumnType } from './column-type';
import type { OracleCase, OracleVerdict } from './types';

import { ownValue } from '../../internal/object';
import { boundaryFixtures } from '../boundary-fixtures';
import { accepts, columnTypeOf, memberChecks } from './members';
import { parameterText } from './pg-text';
import { sameJson } from './same-json';
import { readDisagreement, writeDisagreement } from './verdict';

/** Key types whose ids the wire carries as numbers or booleans in a value of the column. */
const NUMBER_KEYS: ReadonlySet<string> = new Set([
  'int2',
  'int4',
  'float4',
  'float8',
]);

/** The schema of `name` in an object schema's shape, or `undefined` when it does not hold the member. */
function shapeMember(
  shape: Readonly<Record<string, $ZodType>>,
  name: string,
): $ZodType | undefined {
  return ownValue(shape, name);
}

/** The value a stored row held for the only probe column, or `undefined` when the write was refused. */
function storedOf(verdict: OracleVerdict): string | null | undefined {
  return verdict.accepted ? verdict.stored[0] : undefined;
}

function fieldCase(
  internals: DeclaredInternals,
  spec: MemberSpec,
  fixtures: ReadonlyArray<BoundaryFixture>,
): OracleCase {
  const { resource } = internals;
  const type = columnTypeOf(internals, spec.column);
  const write =
    shapeMember(resource.schema.update.shape, spec.name) ??
    shapeMember(resource.schema.create.shape, spec.name);
  const read = shapeMember(resource.schema.read.shape, spec.name);
  return {
    subject: `${resource.names.type}.${spec.name}`,
    kind: 'field',
    probe: {
      kind: 'columns',
      table: resource.table,
      columns: [spec.column],
      checks: memberChecks(internals, spec),
      notNull: true,
    },
    fixtures: fixtures.map(({ value, label }) => ({
      label,
      value,
      texts: [parameterText(value, type)],
      judge: (verdict) => {
        const stored = storedOf(verdict);
        const written =
          write === undefined
            ? undefined
            : writeDisagreement(
                value,
                {
                  accepted: accepts(write, value),
                  givesBack: (back) => sameJson(back, value),
                },
                stored,
                verdict,
                type,
              );
        return (
          written ??
          (read === undefined
            ? undefined
            : readDisagreement(stored, type, (back) => accepts(read, back)))
        );
      },
    })),
  };
}

/** An id as a value of the key column: a number or a boolean for those keys. */
function keyValue(id: unknown, type: ColumnType): unknown {
  if (type.base === 'bool') {
    return id === 'true';
  }
  return NUMBER_KEYS.has(type.base) ? Number(id) : id;
}

function relationshipCase(
  internals: DeclaredInternals,
  spec: RelationshipSpec,
  write: $ZodType,
  fixtures: ReadonlyArray<BoundaryFixture>,
): OracleCase {
  const { resource } = internals;
  const type = columnTypeOf(internals, spec.column);
  const target = spec.target().names.type;
  return {
    subject: `${resource.names.type}.${spec.name}`,
    kind: 'relationship',
    probe: {
      kind: 'columns',
      table: resource.table,
      columns: [spec.column],
      checks: memberChecks(internals, spec),
      notNull: true,
    },
    fixtures: fixtures.map(({ value, label }) => {
      const sent = keyValue(value, type);
      return {
        label,
        value,
        texts: [parameterText(sent, type)],
        judge: (verdict) =>
          writeDisagreement(
            sent,
            {
              accepted: accepts(write, { type: target, id: value }),
              givesBack: (back) =>
                (typeof back === 'string' ? back : String(back)) === value,
            },
            storedOf(verdict),
            verdict,
            type,
          ),
      };
    }),
  };
}

/** The cases of a resource's fields with a wire form and its relationships a client writes. */
export function memberCases(
  internals: DeclaredInternals,
): ReadonlyArray<OracleCase> {
  const { resource, specs } = internals;
  const boundaries = boundaryFixtures(resource);
  const fields = specs.fields.flatMap((spec) => {
    const fixtures = ownValue(boundaries.fields, spec.name);
    return fixtures === undefined || fixtures.length === 0
      ? []
      : [fieldCase(internals, spec, fixtures)];
  });
  const relationships = specs.relationships.flatMap((spec) => {
    const fixtures = ownValue(boundaries.relationships, spec.name) ?? [];
    const write =
      shapeMember(resource.linkage.update.shape, spec.name) ??
      shapeMember(resource.linkage.create.shape, spec.name);
    return write === undefined || fixtures.length === 0
      ? []
      : [relationshipCase(internals, spec, write, fixtures)];
  });
  return [...fields, ...relationships];
}
