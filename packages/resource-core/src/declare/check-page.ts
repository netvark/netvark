/**
 * The page bounds of the definer and of each declaration (SPEC 2, 3.7),
 * checked by the rules `@netvark/jsonapi-core` and `@netvark/keyset-core`
 * share: positive integers, a default no larger than the max, and their
 * common defaults (20 and 100) for a member neither sets.
 * @packageDocumentation
 */
import type { PageCapabilitiesInit } from '@netvark/jsonapi-core';

import { DEFAULT_MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@netvark/keyset-core';

import {
  expectKnownKeys,
  expectRecord,
  optionalBoolean,
  optionalPositiveInteger,
} from '../internal/expect';

const PAGE_KEYS: ReadonlyArray<string> = ['default', 'max', 'range'];

/** Checks a `page` option's members; `undefined` gives an empty init. */
export function checkPageInit(
  path: string,
  value: unknown,
): PageCapabilitiesInit {
  if (value === undefined) {
    return {};
  }
  const page = expectRecord(path, value);
  expectKnownKeys(path, page, PAGE_KEYS);
  const fallback = optionalPositiveInteger(`${path}.default`, page['default']);
  const max = optionalPositiveInteger(`${path}.max`, page['max']);
  const range = optionalBoolean(`${path}.range`, page['range']);
  return {
    ...(fallback === undefined ? {} : { default: fallback }),
    ...(max === undefined ? {} : { max }),
    ...(range === undefined ? {} : { range }),
  };
}

/** Merges `override` over `base` member by member and checks the default against the max. */
export function mergePage(
  path: string,
  base: PageCapabilitiesInit,
  override: PageCapabilitiesInit,
): PageCapabilitiesInit {
  const merged = { ...base, ...override };
  const max = merged.max ?? DEFAULT_MAX_PAGE_SIZE;
  const fallback = merged.default ?? Math.min(DEFAULT_PAGE_SIZE, max);
  if (fallback > max) {
    throw new TypeError(
      `${path}.default: ${String(fallback)} exceeds the max page size ${String(max)}`,
    );
  }
  return merged;
}
