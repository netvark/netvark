import type { BanError, BanErrorInit } from './ban-error';
import type { ErrorStatusCode } from './status';

import { describe, expectTypeOf, it } from 'vitest';

import { isBanError } from './ban-error';

describe('BanError types', () => {
  it('is a plain Error', () => {
    expectTypeOf<BanError>().toExtend<Error>();
  });

  it('takes error statuses only', () => {
    expectTypeOf<BanErrorInit['status']>().toEqualTypeOf<ErrorStatusCode>();
    expectTypeOf<204>().not.toExtend<ErrorStatusCode>();
    expectTypeOf<302>().not.toExtend<ErrorStatusCode>();
    expectTypeOf<418>().toExtend<ErrorStatusCode>();
  });

  it('narrows unknown to BanError', () => {
    expectTypeOf(isBanError).guards.toEqualTypeOf<BanError>();
  });
});
