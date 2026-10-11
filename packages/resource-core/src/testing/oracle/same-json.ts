/**
 * Equality of JSON values: the same primitives (`Object.is`, so `-0` is not
 * `0`), arrays of equal elements in order, and objects with the same own
 * keys holding equal values, in any order.
 * @packageDocumentation
 */
import { isRecord } from '../../internal/object';

/** Whether `left` and `right` are the same JSON value. */
export function sameJson(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((element: unknown, index) => sameJson(element, right[index]))
    );
  }
  if (isRecord(left)) {
    if (!isRecord(right)) {
      return false;
    }
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]),
      )
    );
  }
  return Object.is(left, right);
}
