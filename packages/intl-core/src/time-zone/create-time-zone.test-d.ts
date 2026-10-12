import type { IntlOptions } from '../intl/create-intl';
import type { RequestScope, TimeZoneResolver } from './create-time-zone';

import { describe, expectTypeOf, it } from 'vitest';

import type { AsyncLocalStorage } from 'node:async_hooks';

declare const resolver: TimeZoneResolver;
declare const request: Request;
declare const renderPage: () => Promise<string>;

describe('createTimeZone types (SPEC 4.4)', () => {
  it('takes an AsyncLocalStorage as the request scope', () => {
    expectTypeOf<AsyncLocalStorage<string>>().toExtend<RequestScope<string>>();
    expectTypeOf(resolver.useScope).toBeCallableWith(
      {} as AsyncLocalStorage<string>,
    );
  });

  it('hands its get to createIntl as the time zone getter', () => {
    expectTypeOf(resolver.get).toExtend<IntlOptions['timeZone']>();
  });

  it('returns what the callback of run returns', () => {
    expectTypeOf(resolver.run(request, () => 42)).toEqualTypeOf<number>();
    expectTypeOf(resolver.run(request, renderPage)).toEqualTypeOf<
      Promise<string>
    >();
  });
});
