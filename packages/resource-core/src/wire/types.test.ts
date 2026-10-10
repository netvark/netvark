import { describe, expect, it } from 'vitest';

import { isWireType, WIRE_TYPES } from './types';

describe('isWireType (SPEC 5.1)', () => {
  it('accepts every base type of the table', () => {
    for (const type of WIRE_TYPES) {
      expect(isWireType(type)).toBe(true);
    }
  });

  it('accepts citext in any schema, the way an extension installed elsewhere is named', () => {
    expect(isWireType('extensions.citext')).toBe(true);
    expect(isWireType('.citext')).toBe(false);
  });

  it('rejects types without a wire form and qualified built-in names', () => {
    for (const type of [
      'time',
      'interval',
      'bytea',
      'tstzrange',
      'vector',
      'tsvector',
      'ext.text',
    ]) {
      expect(isWireType(type)).toBe(false);
    }
  });
});
