import type { ErrorItem } from '../../core/error-item';
import type { ErrorStatusCode } from '../../core/status';

const BAD_REQUEST = 400;
const INTERNAL_SERVER_ERROR = 500;

/**
 * The status of a response that reports several problems (SPEC 7.2.4):
 * the one status every item shares, else 400 when all are client errors,
 * else 500. JSON:API asks for "the most generally applicable HTTP error
 * code" and gives those two as the examples. Items without a status are
 * skipped; `undefined` when no item has one.
 * @ref https://jsonapi.org/format/#errors-processing
 */
export function responseStatus(
  errors: ReadonlyArray<ErrorItem>,
): ErrorStatusCode | undefined {
  const statuses = new Set<ErrorStatusCode>();
  for (const item of errors) {
    if (item.status !== undefined) {
      statuses.add(item.status);
    }
  }
  const [first] = statuses;
  if (first === undefined) {
    return undefined;
  }
  if (statuses.size === 1) {
    return first;
  }
  return [...statuses].every((status) => status < INTERNAL_SERVER_ERROR)
    ? BAD_REQUEST
    : INTERNAL_SERVER_ERROR;
}
