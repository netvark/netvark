/**
 * Request text in an error detail (ADR 0016). A detail is shown to people
 * and written to logs as it is, so it quotes a value the client sent only
 * when the value is a plain token (`QUOTABLE_PATTERN`); otherwise the detail
 * says what the value was without it, and `source` still locates it. A
 * value the server declared, such as a resource type a lookup matched, is
 * the server's text and needs no check.
 * @ref https://jsonapi.org/format/1.1/#error-objects ("detail": "a human-readable explanation specific to this occurrence of the problem")
 * @packageDocumentation
 */
import { QUOTABLE_PATTERN } from './constants';

/** Whether an error detail may quote `value`, a text from the request. */
export function quotable(value: string): boolean {
  return QUOTABLE_PATTERN.test(value);
}
