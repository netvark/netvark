/**
 * Reading a form model in the TanStack Form binding (resource SPEC 20.5):
 * the members every model `resourceForm` returns has, and the `TypeError`
 * of an argument that is not one. A model carries no brand, so the
 * binding checks its members, as the model checks a declared resource's,
 * and a JavaScript caller who hands the resource instead learns it at the
 * call.
 * @packageDocumentation
 */
import { isObject } from '../internal/object';

/** The members every form model has (SPEC 20.3). */
const MEMBERS: ReadonlyArray<string> = [
  'type',
  'operation',
  'fields',
  'defaultValues',
  'validator',
  'write',
  'errors',
];

/** Throws a `TypeError` naming `caller` when `model` lacks a member every form model has. */
export function checkModel(caller: string, model: unknown): void {
  if (!isObject(model) || MEMBERS.some((member) => !(member in model))) {
    throw new TypeError(
      `${caller}: model must be what a resourceForm returned`,
    );
  }
}
