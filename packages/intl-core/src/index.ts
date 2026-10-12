/**
 * `@netvark/intl-core`: hydration-safe formatting for any JavaScript
 * runtime. `createIntl` makes formatters that read the locale and the
 * reader's time zone on every call; `isolate` wraps an interpolated value
 * in Unicode bidi isolates. See `docs/intl/SPEC.md` for the contract.
 * @packageDocumentation
 */
export type {
  DateInput,
  IntlFormatters,
  IntlOptions,
  NumberInput,
} from './intl/create-intl';

export { createIntl, DEFAULT_CACHE_SIZE } from './intl/create-intl';
export {
  FIRST_STRONG_ISOLATE,
  isolate,
  POP_DIRECTIONAL_ISOLATE,
} from './isolate';
