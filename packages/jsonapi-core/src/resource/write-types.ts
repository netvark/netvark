/**
 * What a resource definition accepts on write (SPEC 5, 9.2): the Standard
 * Schema validators of a create's and an update's attributes and of the
 * resource id, and the fields each write may carry.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @packageDocumentation
 */
import type { StandardSchema } from '../internal/standard-schema-types';

export interface ResourceValidators<TCreate, TUpdate> {
  /** Validates the attributes of a `POST` or atomic `add`. */
  readonly create?: StandardSchema<unknown, TCreate> | undefined;
  /** Validates the attributes of a `PATCH` or atomic `update`. */
  readonly update?: StandardSchema<unknown, TUpdate> | undefined;
  /**
   * The id's form, whose output is the server's spelling of the key. A
   * create's client-generated id must pass it (with `clientIds`; an issue
   * is a 422 at the id), and an update's id names the request's resource
   * when it is the same text or both pass with one output. JSON:API asks
   * for a universally unique identifier, and the server's keys say which
   * spellings it takes.
   * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
   * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-409
   */
  readonly id?: StandardSchema<unknown, string> | undefined;
}

/**
 * The fields each write may carry, by public name (SPEC 5, 9.2): a field an
 * operation's list leaves out is refused as `FORBIDDEN`, since JSON:API
 * requires 403 for an unsupported update and allows it for an unsupported
 * create. An operation without a list accepts every field.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-403
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-403
 */
export interface WritableFieldsInit<TField extends string> {
  /** The fields a `POST` or an atomic `add` may carry. */
  readonly create?: ReadonlyArray<TField> | undefined;
  /** The fields a `PATCH`, an atomic `update`, or a relationship update may carry. */
  readonly update?: ReadonlyArray<TField> | undefined;
}

/** The fields each write accepts, resolved: every field where the definition gave no list. */
export interface WritableFields {
  readonly create: ReadonlySet<string>;
  readonly update: ReadonlySet<string>;
}
