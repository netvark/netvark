import type { ResponseError } from './response-error';

/**
 * `isResponseError`'s type parameter types the code (SPEC 15.7): a code
 * the application's catalog does not have fails `tsc`.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { isResponseError } from './response-error';

type AppCode = 'CONTACT_EMAIL_TAKEN' | 'QUOTA_EXCEEDED';

describe('isResponseError (SPEC 15.7)', () => {
  it('narrows to ResponseError', () => {
    const value: unknown = undefined;
    if (isResponseError(value)) {
      expectTypeOf(value).toEqualTypeOf<ResponseError>();
    }
  });

  it("takes only the catalog's codes when given the catalog", () => {
    const value: unknown = undefined;
    expectTypeOf(
      isResponseError<AppCode>(value, 'QUOTA_EXCEEDED'),
    ).toBeBoolean();
    // @ts-expect-error not a code of the catalog
    isResponseError<AppCode>(value, 'NOT_A_CODE');
    expectTypeOf(isResponseError(value, 'ANY_CODE')).toBeBoolean();
  });
});
