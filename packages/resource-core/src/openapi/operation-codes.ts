/**
 * The codes each operation of the document may answer with (SPEC 9, 12,
 * 13.1), by what raises them:
 *
 * - any request: content negotiation, `NOT_ACCEPTABLE` and
 *   `UNSUPPORTED_MEDIA_TYPE`, and an unexpected failure,
 *   `INTERNAL_SERVER_ERROR` (jsonapi SPEC 3.3, 10.5);
 * - a list or a get: `parseQuery`'s codes (jsonapi SPEC 6, 8.4); a denied
 *   list is `FORBIDDEN`, a denied or missing row `NOT_FOUND`, a denied
 *   include `FORBIDDEN` (12.2);
 * - a create or an update: the request document's codes, `MALFORMED_JSON`,
 *   `INVALID_DOCUMENT`, `CONFLICT` for a type or id that differs, and
 *   `VALIDATION_FAILED` (jsonapi SPEC 9.2, 10.3); a create's id without
 *   client ids, `CLIENT_GENERATED_ID_NOT_SUPPORTED`; `FORBIDDEN` for a
 *   member the operation does not accept (9.4) and a denied create; the
 *   resource's derived codes the operation can raise (9.1, 9.5);
 * - a remove: `NOT_FOUND`, and `CONFLICT` for a row still referenced (9.5);
 * - a relationship's endpoints: a get's `NOT_FOUND`, and an update's
 *   document codes with the derived codes over that relationship;
 * - the Atomic Operations endpoint: the processor's own, a document's
 *   codes, `FORBIDDEN` for an operation its resource does not declare,
 *   and `NOT_FOUND` for a type no resource has (jsonapi SPEC 11.2, 11.4),
 *   and every code of each write an operation can run.
 *
 * The codes of the application's rules and quotas, and the ones its
 * middleware adds to every response, come from the options, since rules
 * are functions the declaration cannot read.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { DeclaredInternals } from '../declare/declared-resource';
import type { Operation } from '../declare/types';
import type { ErrorEntry } from '../errors/error-entry';

import { carries } from './member-schemas';

/** The application's codes the declarations cannot know (SPEC 13.1). */
export interface OperationCodes {
  /** Codes any operation may answer with: an authentication middleware's `UNAUTHORIZED`, a mapper's `SERVICE_UNAVAILABLE`. */
  readonly all?: ReadonlyArray<string> | undefined;
  /** By type and operation: the codes a resource's rules and quota raise. */
  readonly resources?:
    | Readonly<
        Record<string, Partial<Record<Operation, ReadonlyArray<string>>>>
      >
    | undefined;
}

/** An operation of the document: a declared operation, or one of a relationship's endpoints. */
export type DocumentOperation =
  | { readonly kind: Operation }
  | {
      readonly kind: 'relationship' | 'related' | 'relationshipUpdate';
      readonly name: string;
    };

const ALWAYS = [
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_SERVER_ERROR',
];
const QUERY = [
  'INVALID_QUERY_PARAMETER',
  'UNKNOWN_QUERY_PARAMETER',
  'UNSUPPORTED_SORT',
  'MAX_PAGE_SIZE_EXCEEDED',
];
const DOCUMENT = [
  'MALFORMED_JSON',
  'INVALID_DOCUMENT',
  'CONFLICT',
  'VALIDATION_FAILED',
];

/** The declared operation whose rules and policy a document operation runs. */
const POLICY_OPERATION: Readonly<Record<DocumentOperation['kind'], Operation>> =
  {
    list: 'list',
    get: 'get',
    create: 'create',
    update: 'update',
    remove: 'remove',
    relationship: 'get',
    related: 'get',
    relationshipUpdate: 'update',
  };

function queryCodes(internals: DeclaredInternals): ReadonlyArray<string> {
  const { page } = internals.resource.resource.query;
  return page === undefined || page.range
    ? QUERY
    : [...QUERY, 'RANGE_PAGINATION_NOT_SUPPORTED'];
}

/** The public members an update writes. */
function updatedMembers(internals: DeclaredInternals): ReadonlySet<string> {
  return new Set(
    Object.values(internals.resource.fields)
      .filter((meta) => carries('update', meta.access))
      .map((meta) => meta.name),
  );
}

/** Whether an update can raise `entry`: never a primary key, and a NOT NULL only of a member it writes. */
function raisedByUpdate(
  internals: DeclaredInternals,
  entry: ErrorEntry,
): boolean {
  if (entry.kind === 'primaryKey') {
    return false;
  }
  const updated = updatedMembers(internals);
  return (
    entry.kind !== 'notNull' || entry.fields.every((name) => updated.has(name))
  );
}

function derivedCodes(
  internals: DeclaredInternals,
  keep: (entry: ErrorEntry) => boolean,
): ReadonlyArray<string> {
  return Object.entries(internals.resource.errors)
    .filter(([, entry]) => keep(entry))
    .map(([code]) => code);
}

/** Whether an update refuses a member with `FORBIDDEN`: a `read` or `immutable` one (9.4). */
function refusesMembers(internals: DeclaredInternals): boolean {
  return Object.values(internals.resource.fields).some(
    (meta) => !carries('update', meta.access) && meta.access !== 'write',
  );
}

const DECLARED: Readonly<
  Record<Operation, (internals: DeclaredInternals) => ReadonlyArray<string>>
> = {
  list: (internals) => [...queryCodes(internals), 'FORBIDDEN'],
  get: (internals) => [
    ...queryCodes(internals),
    'NOT_FOUND',
    ...(internals.resource.resource.query.include.length === 0
      ? []
      : ['FORBIDDEN']),
  ],
  create: (internals) => [
    ...DOCUMENT,
    'FORBIDDEN',
    ...(internals.resource.resource.clientIds
      ? []
      : ['CLIENT_GENERATED_ID_NOT_SUPPORTED']),
    ...derivedCodes(internals, () => true),
  ],
  update: (internals) => [
    ...DOCUMENT,
    'NOT_FOUND',
    ...(refusesMembers(internals) ? ['FORBIDDEN'] : []),
    ...derivedCodes(internals, (entry) => raisedByUpdate(internals, entry)),
  ],
  remove: () => ['NOT_FOUND', 'CONFLICT'],
};

function ownCodes(
  internals: DeclaredInternals,
  operation: DocumentOperation,
): ReadonlyArray<string> {
  if (operation.kind === 'relationship' || operation.kind === 'related') {
    return ['NOT_FOUND'];
  }
  if (operation.kind === 'relationshipUpdate') {
    const { name } = operation;
    return [
      ...DOCUMENT,
      'NOT_FOUND',
      ...derivedCodes(
        internals,
        (entry) =>
          entry.fields.includes(name) && raisedByUpdate(internals, entry),
      ),
    ];
  }
  return DECLARED[operation.kind](internals);
}

/** Every code `operation` of the resource may answer with, each once, in a stable order. */
export function operationCodes(
  internals: DeclaredInternals,
  operation: DocumentOperation,
  codes: OperationCodes = {},
): ReadonlyArray<string> {
  const policy = POLICY_OPERATION[operation.kind];
  const configured =
    codes.resources?.[internals.resource.names.type]?.[policy] ?? [];
  return [
    ...new Set([
      ...ALWAYS,
      ...ownCodes(internals, operation),
      ...configured,
      ...(codes.all ?? []),
    ]),
  ];
}

/**
 * The writes an operation can run on the resource: its declared create,
 * update, and remove. An update of a relationship writes what the
 * resource's update can, so it raises none of its own codes.
 */
function writesOf(internals: DeclaredInternals): Array<DocumentOperation> {
  return internals.resource.declaration.operations
    .filter((operation) => operation !== 'list' && operation !== 'get')
    .map((kind) => ({ kind }));
}

/** Every code the Atomic Operations endpoint may answer with, each once, in a stable order. */
export function atomicCodes(
  listed: ReadonlyArray<DeclaredInternals>,
  codes: OperationCodes = {},
): ReadonlyArray<string> {
  return [
    ...new Set([
      ...ALWAYS,
      ...DOCUMENT,
      'FORBIDDEN',
      'NOT_FOUND',
      ...listed.flatMap((internals) =>
        writesOf(internals).flatMap((operation) =>
          operationCodes(internals, operation, codes),
        ),
      ),
    ]),
  ];
}
