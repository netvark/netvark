/**
 * The cases of the validators a resource's schemas run (SPEC 7.2, 7.3):
 * each validator's fixtures written into a copy of the columns of the
 * CHECK it stands for, holding only that CHECK and not the columns' NOT
 * NULL, or into a value of its domain. An `accept` fixture must be stored, and a `reject` fixture
 * refused by that CHECK; a refusal by anything else says nothing of the
 * CHECK, so it is reported too. Each CHECK is tried once, however many
 * members run its validator.
 * @packageDocumentation
 */
import type { DeclaredInternals } from '../../declare/declared-resource';
import type { MemberSpec } from '../../schema/field-spec';
import type { MultiColumnCheck } from '../../schema/multi-column';
import type { ValidatorUse, ValueSpec } from '../../schema/value-form';
import type { TextStorage } from './members';
import type {
  OracleCase,
  OracleFixture,
  OracleProbe,
  OracleVerdict,
} from './types';

import { isRecord, ownValue } from '../../internal/object';
import { columnType } from './column-type';
import { memberText, storageOf, writeText } from './members';
import { parameterText } from './pg-text';
import { Unwritable, unwritableReason } from './unwritable';
import { refusal } from './verdict';

/** PostgreSQL's SQLSTATE for a row a CHECK refuses. */
const CHECK_VIOLATION = '23514';

type List = 'accept' | 'reject';

/** A validator's use and where its uses sit: at the top of a member's value, or inside an array's elements. */
interface FoundUse {
  readonly use: ValidatorUse;
  readonly top: boolean;
}

function usesOf(spec: ValueSpec, top: boolean): ReadonlyArray<FoundUse> {
  const own = spec.validators.map((use) => ({ use, top }));
  return spec.form.kind === 'array'
    ? [...own, ...usesOf(spec.form.element, false)]
    : own;
}

/** Whether the database's verdict on a fixture of `list` is the validator's. */
function judgeOf(
  list: List,
  constraint: string,
): (verdict: OracleVerdict) => string | undefined {
  return (verdict) => {
    if (list === 'accept') {
      return verdict.accepted
        ? undefined
        : `the validator accepts it; the database refuses it (${refusal(verdict)})`;
    }
    if (verdict.accepted) {
      return 'the validator refuses it; the database accepts it';
    }
    return verdict.code === CHECK_VIOLATION && verdict.constraint === constraint
      ? undefined
      : `the validator refuses it; the database refuses it (${refusal(verdict)}) before ${constraint} decides`;
  };
}

/** The fixtures of `use`, each written as `texts` makes it; one `texts` throws on is unwritable, for the reason it gives. */
function fixturesOf(
  use: ValidatorUse,
  texts: (value: unknown) => ReadonlyArray<string | null>,
): ReadonlyArray<OracleFixture> {
  const lists: ReadonlyArray<readonly [List, ReadonlyArray<unknown>]> = [
    ['accept', use.validator.fixtures.accept],
    ['reject', use.validator.fixtures.reject],
  ];
  return lists.flatMap(([list, values]) =>
    values.map((value, index): OracleFixture => {
      const label = `${list}[${String(index)}]`;
      try {
        return {
          label,
          value,
          texts: texts(value),
          judge: judgeOf(list, use.check.constraint),
        };
      } catch (error) {
        return { label, value, unwritable: unwritableReason(error) };
      }
    }),
  );
}

function subjectOf(table: string, use: ValidatorUse): string {
  const { domain, constraint } = use.check;
  const owner = domain === null ? table : `domain ${domain}`;
  return `${owner} CHECK ${constraint} (validator ${use.name})`;
}

/** The case of a validator found on a member: its table's CHECK over the member's column, or its domain's. */
function memberUseCase(
  internals: DeclaredInternals,
  spec: MemberSpec,
  found: FoundUse,
  storage: TextStorage,
): OracleCase {
  const { use, top } = found;
  const { table } = internals.resource;
  const { domain, constraint } = use.check;
  let probe: OracleProbe;
  let text: (value: unknown) => string | null;
  if (domain === null) {
    probe = {
      kind: 'columns',
      table,
      columns: [spec.column],
      checks: [constraint],
      notNull: false,
    };
    text = memberText(internals, spec, storage);
  } else {
    probe = { kind: 'domain', domain };
    const { form } = spec.value;
    if (top && form.kind === 'codec') {
      const codec = storageOf(storage, form.name, internals, spec);
      text = (value) => (value === null ? null : writeText(codec, value));
    } else {
      const type = columnType(internals.catalog, {
        type: domain,
        typeKind: 'domain',
        array: false,
      });
      text = (value) => (value === null ? null : parameterText(value, type));
    }
  }
  return {
    subject: subjectOf(table, use),
    kind: 'validator',
    probe,
    fixtures: fixturesOf(use, (value) => [text(value)]),
  };
}

/** The case of a validator of a CHECK over several members: an object of their values, keyed by public name, a missing one written as `NULL`. */
function checkCase(
  internals: DeclaredInternals,
  check: MultiColumnCheck,
  storage: TextStorage,
): OracleCase {
  const { names, table } = internals.resource;
  const { specs } = internals;
  const members = check.members.map((member) => {
    const spec =
      member.kind === 'field'
        ? specs.fields.find(({ name }) => name === member.name)
        : specs.relationships.find(({ name }) => name === member.name);
    if (spec === undefined) {
      throw new TypeError(
        `oracleCases: ${names.type}.${member.name} is not a member`,
      );
    }
    return {
      name: member.name,
      column: spec.column,
      text: memberText(internals, spec, storage),
    };
  });
  return {
    subject: subjectOf(table, check.use),
    kind: 'validator',
    probe: {
      kind: 'columns',
      table,
      columns: members.map(({ column }) => column),
      checks: [check.constraint],
      notNull: false,
    },
    fixtures: fixturesOf(check.use, (value) => {
      if (!isRecord(value)) {
        throw new Unwritable(
          `it is not an object of ${members.map(({ name }) => name).join(', ')}`,
        );
      }
      return members.map(({ name, text }) =>
        text(ownValue(value, name) ?? null),
      );
    }),
  };
}

/** The cases of a resource's validators whose CHECK `seen` does not hold yet; adds each CHECK to it. */
export function validatorCases(
  internals: DeclaredInternals,
  storage: TextStorage,
  seen: Set<string>,
): ReadonlyArray<OracleCase> {
  const { specs, resource } = internals;
  const fresh = (use: ValidatorUse): boolean => {
    const { domain, constraint } = use.check;
    const key = JSON.stringify([
      domain === null ? resource.table : null,
      domain,
      constraint,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
  const onMembers = (
    members: ReadonlyArray<MemberSpec>,
  ): ReadonlyArray<OracleCase> =>
    members.flatMap((spec) =>
      usesOf(spec.value, true)
        .filter(({ use }) => fresh(use))
        .map((found) => memberUseCase(internals, spec, found, storage)),
    );
  return [
    ...onMembers(specs.fields),
    ...onMembers(specs.relationships),
    ...specs.checks
      .filter((check) => fresh(check.use))
      .map((check) => checkCase(internals, check, storage)),
  ];
}
