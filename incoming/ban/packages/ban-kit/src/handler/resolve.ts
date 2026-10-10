import type { BanError } from '../core/ban-error';
import type { BanCore } from '../core/internal';
import type { Ban, Catalog, ErrorMapper } from '../core/types';

import { isBanError } from '../core/ban-error';

export interface Resolved {
  readonly error: BanError;
  readonly handled: boolean;
}

/**
 * Thrown value to `BanError` (SPEC 6.3): a `BanError` as is, then the
 * adapter's `adopt` hook, then `map`, then the constant-detail 500. A hook
 * or map that throws or returns something other than `undefined` or a
 * `BanError` is a handler failure and propagates to the fallback.
 */
export function resolveThrown<TErrors extends Catalog>(
  thrown: unknown,
  ban: Ban<TErrors>,
  core: Pick<BanCore, 'adopt' | 'unexpected'>,
  map: ErrorMapper<TErrors> | undefined,
): Resolved {
  if (isBanError(thrown)) {
    return { error: thrown, handled: true };
  }
  const adopted: unknown = core.adopt(thrown);
  if (adopted !== undefined) {
    if (!isBanError(adopted)) {
      throw new TypeError('adopt() must return a BanError or undefined');
    }
    return { error: adopted, handled: true };
  }
  if (map !== undefined) {
    const mapped: unknown = map(thrown, ban);
    if (isBanError(mapped)) {
      return { error: mapped, handled: true };
    }
    if (mapped !== undefined) {
      throw new TypeError(
        'map() must return a BanError or undefined; use ban.custom() for other shapes',
      );
    }
  }
  return { error: core.unexpected(thrown), handled: false };
}
