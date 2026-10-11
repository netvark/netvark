/**
 * `diffSurfaces(before, after)` (SPEC 13.2): every difference between two
 * surfaces, each marked breaking when a client written against `before`
 * may fail against `after`. A type, operation, field, relationship, code,
 * operator, or flag removed breaks one, and so does a rename, which shows
 * as a removal and an addition; an addition breaks one only when it is a
 * member a create must carry. A code's status changed, the search
 * parameter removed or renamed, a smaller page maximum, and range pages
 * withdrawn break one too; a new default page size does not, since the
 * page's links carry it. The member rules are in `diff-members.ts`.
 * @packageDocumentation
 */
import type { Path, SurfaceChange } from './diff-change';
import type { PageSurface, ResourceSurface, Surface } from './surface';

import {
  changed,
  diffEqual,
  diffFlag,
  diffKeyed,
  diffSet,
} from './diff-change';
import { diffField, diffRelationship } from './diff-members';

export type { SurfaceChange } from './diff-change';

type Changes = ReadonlyArray<SurfaceChange>;

function diffSearch(
  path: Path,
  before: string | null,
  after: string | null,
): Changes {
  if (before === after) {
    return [];
  }
  if (before === null || after === null) {
    return [
      {
        path,
        change: before === null ? 'added' : 'removed',
        breaking: after === null,
        before,
        after,
      },
    ];
  }
  return changed(path, true, before, after);
}

function diffPage(
  path: Path,
  before: PageSurface | null,
  after: PageSurface | null,
): Changes {
  if (before === null || after === null) {
    return before === after
      ? []
      : [
          {
            path,
            change: before === null ? 'added' : 'removed',
            breaking: after === null,
            before,
            after,
          },
        ];
  }
  return [
    ...(before.default === after.default
      ? []
      : changed([...path, 'default'], false, before.default, after.default)),
    ...(before.max === after.max
      ? []
      : changed(
          [...path, 'max'],
          after.max < before.max,
          before.max,
          after.max,
        )),
    ...diffFlag([...path, 'range'], before.range, after.range),
  ];
}

function diffResource(
  path: Path,
  before: ResourceSurface,
  after: ResourceSurface,
): Changes {
  const creates = after.operations.includes('create');
  const requiredOnCreate = (member: { readonly required: boolean }): boolean =>
    creates && member.required;
  return [
    ...diffSet([...path, 'operations'], before.operations, after.operations, {
      added: false,
      removed: true,
    }),
    ...diffKeyed(
      [...path, 'fields'],
      before.fields,
      after.fields,
      requiredOnCreate,
      (field, old, now) => diffField(field, old, now, creates),
    ),
    ...diffKeyed(
      [...path, 'relationships'],
      before.relationships,
      after.relationships,
      requiredOnCreate,
      (relationship, old, now) =>
        diffRelationship(relationship, old, now, creates),
    ),
    ...diffKeyed(
      [...path, 'codes'],
      before.codes,
      after.codes,
      () => false,
      diffEqual,
    ),
    ...diffSearch([...path, 'search'], before.search, after.search),
    ...diffPage([...path, 'page'], before.page, after.page),
  ];
}

/** Every difference from `before` to `after`, by type, then by part, in key order. */
export function diffSurfaces(
  before: Surface,
  after: Surface,
): ReadonlyArray<SurfaceChange> {
  return diffKeyed(
    [],
    before.resources,
    after.resources,
    () => false,
    diffResource,
  );
}
