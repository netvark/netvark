/**
 * The entry of a derived error code (SPEC 9.1): the status and title its
 * constraint's kind fixes, the kind, whose texts localized messages give
 * once for all its codes (SPEC 10.1), and the public members the error's
 * items point at. JSON:API requires 404 when a request references a related resource
 * that does not exist and 409 for a client-generated id that exists, allows
 * 409 for a uniqueness violation, and reports an invalid attribute as 422
 * with a pointer in its examples.
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses
 * @ref https://jsonapi.org/examples/#error-objects
 * @packageDocumentation
 */

/** The kind of constraint behind a derived code. */
export type ConstraintKind =
  | 'check'
  | 'notNull'
  | 'unique'
  | 'primaryKey'
  | 'exclusion'
  | 'foreignKey';

/** The status and title of each kind. */
interface KindStatus {
  readonly check: { readonly status: 422; readonly title: 'Invalid Attribute' };
  readonly notNull: {
    readonly status: 422;
    readonly title: 'Invalid Attribute';
  };
  readonly unique: { readonly status: 409; readonly title: 'Conflict' };
  readonly primaryKey: { readonly status: 409; readonly title: 'Conflict' };
  readonly exclusion: { readonly status: 409; readonly title: 'Conflict' };
  readonly foreignKey: {
    readonly status: 404;
    readonly title: 'Related Resource Not Found';
  };
}

const INVALID = { status: 422, title: 'Invalid Attribute' } as const;
const CONFLICT = { status: 409, title: 'Conflict' } as const;

/** The status and title of each kind (SPEC 9.1). */
export const KIND_STATUS: KindStatus = {
  check: INVALID,
  notNull: INVALID,
  unique: CONFLICT,
  primaryKey: CONFLICT,
  exclusion: CONFLICT,
  foreignKey: { status: 404, title: 'Related Resource Not Found' },
};

/** The English detail of each kind (SPEC 9.1): constant, so it never repeats request data. */
export const KIND_DETAIL: Readonly<Record<ConstraintKind, string>> =
  Object.freeze({
    check: 'The value violates a constraint.',
    notNull: 'A value is required.',
    unique: 'Another record already has this value.',
    primaryKey: 'A record with this id already exists.',
    exclusion: 'The value conflicts with another record.',
    foreignKey: 'The related resource does not exist.',
  });

/** A derived code's entry, `ErrorEntry<'unique', 'email'>` for one code. */
export interface ErrorEntry<
  TKind extends ConstraintKind = ConstraintKind,
  TField extends string = string,
> {
  readonly status: KindStatus[TKind]['status'];
  readonly title: KindStatus[TKind]['title'];
  readonly kind: TKind;
  /** The public fields and relationships the items point at, or `id` for the primary key. */
  readonly fields: ReadonlyArray<TField>;
}

/** The frozen entry of a code of `kind` over `fields`. */
export function errorEntry(
  kind: ConstraintKind,
  fields: ReadonlyArray<string>,
): ErrorEntry {
  return Object.freeze({
    ...KIND_STATUS[kind],
    kind,
    fields: Object.freeze([...fields]),
  });
}
