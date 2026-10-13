/**
 * The vendored `HeadersInit` against the DOM library's, which the package
 * compiles with: the same type, so any value either accepts, the other
 * accepts, and `new Headers(init)` takes it. A release of TypeScript that
 * changes the DOM library's alias fails here.
 */
import type { HeadersInit as Vendored } from './headers-init';

import { describe, expectTypeOf, it } from 'vitest';

describe('HeadersInit (Fetch Standard)', () => {
  it("is the DOM library's alias", () => {
    expectTypeOf<Vendored>().toEqualTypeOf<HeadersInit>();
  });

  it('is what the Headers constructor takes', () => {
    expectTypeOf<Vendored>().toExtend<
      NonNullable<ConstructorParameters<typeof Headers>[0]>
    >();
  });
});
