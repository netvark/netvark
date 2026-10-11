/**
 * The comparisons of a field and a relationship (SPEC 13.2). A change
 * breaks a client when the server stops taking what it sent or starts
 * sending what it did not expect: a capability lost from the access, a
 * member becoming required on create, a writable member becoming
 * non-nullable or a readable one nullable, a representation changed, an
 * option or operator removed, a limit tightened, a pattern added, a
 * sortable or include flag removed. The opposite of each loosens the
 * surface and breaks nobody.
 * @packageDocumentation
 */
import type { Access } from '../declare/types';
import type { FieldLimits } from '../meta/types';
import type { Path, SurfaceChange } from './diff-change';
import type {
  FieldSurface,
  RelationshipSurface,
  ValueSurface,
} from './surface';

import { compareDecimals } from '../wire/decimal';
import { changed, diffEqual, diffFlag, diffSet } from './diff-change';

type Capability = 'read' | 'create' | 'update';

/** What each access lets a client do (SPEC 3.1). */
const CAPABILITIES: Readonly<Record<Access, ReadonlyArray<Capability>>> = {
  read: ['read'],
  write: ['create', 'update'],
  readWrite: ['read', 'create', 'update'],
  immutable: ['read', 'create'],
};

const REMOVAL_BREAKS = { added: false, removed: true } as const;
const ADDITION_BREAKS = { added: true, removed: false } as const;

type Changes = ReadonlyArray<SurfaceChange>;

/** The members of a field or relationship the access, requiredness, and nullability rules read. */
interface Member {
  readonly access: Access;
  readonly required: boolean;
  readonly nullable: boolean;
}

function diffAccess(path: Path, before: Access, after: Access): Changes {
  const kept = CAPABILITIES[after];
  const lost = CAPABILITIES[before].some(
    (capability) => !kept.includes(capability),
  );
  return before === after
    ? []
    : changed([...path, 'access'], lost, before, after);
}

/** Requiredness, which breaks a create only when the resource has one, and nullability, read by the access after. */
function diffMember(
  path: Path,
  before: Member,
  after: Member,
  creates: boolean,
): Changes {
  const capabilities = CAPABILITIES[after.access];
  const writable =
    capabilities.includes('create') || capabilities.includes('update');
  const readable = capabilities.includes('read');
  return [
    ...diffAccess(path, before.access, after.access),
    ...(before.required === after.required
      ? []
      : changed(
          [...path, 'required'],
          creates && after.required,
          before.required,
          after.required,
        )),
    ...(before.nullable === after.nullable
      ? []
      : changed(
          [...path, 'nullable'],
          after.nullable ? readable : writable,
          before.nullable,
          after.nullable,
        )),
  ];
}

/** A length, step, or digits bound: tighter when it appears or `tighter` says it moved inward. */
function diffBound<TBound extends number | string>(
  path: Path,
  before: TBound | null,
  after: TBound | null,
  tighter: (before: TBound, after: TBound) => boolean,
): Changes {
  if (before === after) {
    return [];
  }
  const breaking =
    after !== null && (before === null || tighter(before, after));
  return changed(path, breaking, before, after);
}

interface Bound {
  readonly value: string;
  readonly exclusive: boolean;
}

function boundOf(
  inclusive: string | null,
  exclusive: string | null,
): Bound | null {
  if (exclusive !== null) {
    return { value: exclusive, exclusive: true };
  }
  return inclusive === null ? null : { value: inclusive, exclusive: false };
}

/** Whether `after` admits fewer values than `before` on its side: `1` for a lower bound, `-1` for an upper one. */
function narrower(
  before: Bound | null,
  after: Bound | null,
  side: 1 | -1,
): boolean {
  if (after === null) {
    return false;
  }
  if (before === null) {
    return true;
  }
  const order = compareDecimals(after.value, before.value) * side;
  return order > 0 || (order === 0 && after.exclusive && !before.exclusive);
}

/** A numeric side's two keywords, each reported where it changed, breaking when the side narrowed. */
function diffSide(
  path: Path,
  before: FieldLimits,
  after: FieldLimits,
  keys:
    | readonly ['minimum', 'exclusiveMinimum']
    | readonly ['maximum', 'exclusiveMaximum'],
  side: 1 | -1,
): Changes {
  const [inclusive, exclusive] = keys;
  const breaking = narrower(
    boundOf(before[inclusive], before[exclusive]),
    boundOf(after[inclusive], after[exclusive]),
    side,
  );
  return keys
    .filter((key) => before[key] !== after[key])
    .flatMap((key) =>
      changed([...path, key], breaking, before[key], after[key]),
    );
}

function diffLimits(
  path: Path,
  before: FieldLimits,
  after: FieldLimits,
): Changes {
  return [
    ...diffBound(
      [...path, 'minLength'],
      before.minLength,
      after.minLength,
      (old, now) => now > old,
    ),
    ...diffBound(
      [...path, 'maxLength'],
      before.maxLength,
      after.maxLength,
      (old, now) => now < old,
    ),
    ...diffSide(path, before, after, ['minimum', 'exclusiveMinimum'], 1),
    ...diffSide(path, before, after, ['maximum', 'exclusiveMaximum'], -1),
    ...diffBound(
      [...path, 'multipleOf'],
      before.multipleOf,
      after.multipleOf,
      (old, now) => compareDecimals(now, old) > 0,
    ),
    ...diffSet(
      [...path, 'patterns'],
      before.patterns,
      after.patterns,
      ADDITION_BREAKS,
    ),
  ];
}

/** Options: a closed set appearing, or a label removed, breaks a client. */
function diffOptions(
  path: Path,
  before: ReadonlyArray<string> | null,
  after: ReadonlyArray<string> | null,
): Changes {
  if (before === null || after === null) {
    return before === after ? [] : changed(path, after !== null, before, after);
  }
  return diffSet(path, before, after, REMOVAL_BREAKS);
}

/** What a value takes: its representation, its fraction digits as a bound, its limits, and its options. */
function diffValue(
  path: Path,
  before: ValueSurface,
  after: ValueSurface,
): Changes {
  return [
    ...diffEqual([...path, 'wire'], before.wire, after.wire),
    ...diffEqual([...path, 'format'], before.format, after.format),
    ...diffBound(
      [...path, 'fractionDigits'],
      before.fractionDigits,
      after.fractionDigits,
      (old, now) => now < old,
    ),
    ...diffLimits([...path, 'limits'], before.limits, after.limits),
    ...diffOptions([...path, 'options'], before.options, after.options),
  ];
}

function diffItems(
  path: Path,
  before: ValueSurface | null,
  after: ValueSurface | null,
): Changes {
  if (before === null || after === null) {
    return diffEqual(path, before, after);
  }
  return diffValue(path, before, after);
}

/** A field of a resource that has a create when `creates`. */
export function diffField(
  path: Path,
  before: FieldSurface,
  after: FieldSurface,
  creates: boolean,
): Changes {
  return [
    ...diffMember(path, before, after, creates),
    ...diffValue(path, before, after),
    ...diffItems([...path, 'items'], before.items, after.items),
    ...diffEqual([...path, 'codec'], before.codec, after.codec),
    ...diffSet(
      [...path, 'operators'],
      before.operators,
      after.operators,
      REMOVAL_BREAKS,
    ),
    ...diffFlag([...path, 'sortable'], before.sortable, after.sortable),
  ];
}

export function diffRelationship(
  path: Path,
  before: RelationshipSurface,
  after: RelationshipSurface,
  creates: boolean,
): Changes {
  return [
    ...diffEqual([...path, 'target'], before.target, after.target),
    ...diffMember(path, before, after, creates),
    ...diffSet(
      [...path, 'operators'],
      before.operators,
      after.operators,
      REMOVAL_BREAKS,
    ),
    ...diffFlag([...path, 'include'], before.include, after.include),
  ];
}
