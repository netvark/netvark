/**
 * `errorResponses`' result (SPEC 9): Response Objects only, unless
 * `responseRef` may be given, when a status may be a Reference Object.
 */
import type { ReferenceObject, ResponseObject } from './index';

import { describe, expectTypeOf, it } from 'vitest';

import { mixing } from '../test-support/mixed-catalog';
import { errorResponses } from './index';

declare const options: { readonly responseRef?: (key: string) => string };

describe('errorResponses', () => {
  it('gives Response Objects without responseRef', () => {
    expectTypeOf(errorResponses(mixing, [403])).toEqualTypeOf<
      Record<string, ResponseObject>
    >();
    expectTypeOf(
      errorResponses(mixing, [403], { objectRef: (key) => key }),
    ).toEqualTypeOf<Record<string, ResponseObject>>();
  });

  it('may give Reference Objects once responseRef may be given', () => {
    expectTypeOf(
      errorResponses(mixing, [403], { responseRef: (key) => key }),
    ).toEqualTypeOf<Record<string, ResponseObject | ReferenceObject>>();
    expectTypeOf(errorResponses(mixing, [403], options)).toEqualTypeOf<
      Record<string, ResponseObject | ReferenceObject>
    >();
  });
});
