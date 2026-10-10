import { describe, expect, it } from 'vitest';

import { isErrorStatus } from './status';

describe('isErrorStatus', () => {
  it('accepts the 4xx and 5xx classes, registered or not', () => {
    for (const status of [400, 404, 418, 451, 499, 500, 511, 599]) {
      expect(isErrorStatus(status)).toBe(true);
    }
  });

  it('rejects other classes and non-integers', () => {
    for (const value of [200, 302, 399, 600, 404.5, Number.NaN, '404', null]) {
      expect(isErrorStatus(value)).toBe(false);
    }
  });
});
