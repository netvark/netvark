import type { BanError } from './ban-error';
import type { BanCore } from './internal';

import { isBanError } from './ban-error';

/**
 * `ban.from()` (SPEC 5.5): a `BanError` as it is, a value the `adopt` hook
 * recognizes as what the hook returns, anything else as the constant-detail
 * 500 with the value as `cause`. Never throws: a hook that fails counts as
 * declining here, so the promise holds outside a handler too. Inside one,
 * `resolveThrown` lets the failure reach the fallback and the report.
 */
export function createFrom(core: BanCore): (value: unknown) => BanError {
  return (value: unknown): BanError => {
    if (isBanError(value)) {
      return value;
    }
    let adopted: BanError | undefined;
    try {
      adopted = core.adopt(value);
    } catch {
      adopted = undefined;
    }
    return adopted ?? core.unexpected(value);
  };
}
