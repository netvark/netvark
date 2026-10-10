import type { BanError } from '../core/ban-error';
import type { BanCore } from '../core/internal';
import type { ValidationOptions } from '../core/types';
import type { ValidationIssue } from './issue';

import { itemsFromIssues } from '../core/error-item';
import { VALIDATION_DETAIL } from '../internal/constants';

/**
 * `ban.validation()` (SPEC 8.2): the validation entry with one item per
 * issue, each at `location`. The location also travels in `meta.location`,
 * where every format can read it for the response as a whole.
 */
export function createValidation(
  core: BanCore,
): (
  issues: ReadonlyArray<ValidationIssue>,
  options: ValidationOptions,
) => BanError {
  return (issues, options) =>
    core.build(core.definition(core.validationKey), {
      detail: options.detail ?? VALIDATION_DETAIL,
      meta: { ...options.meta, location: options.location },
      errors: itemsFromIssues(issues, options.location),
      cause: options.cause,
    });
}
