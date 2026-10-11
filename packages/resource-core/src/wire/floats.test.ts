import { describe, expect, it } from 'vitest';

import { isStorableReal, realText } from './floats';

/** The float32 with these bits. */
function float32(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits);
  return view.getFloat32(0);
}

describe('realText: the text PostgreSQL prints for a real, as JavaScript reads it (SPEC 3.4)', () => {
  // Each case was read back from PostgreSQL 14 and 18 (`'<value>'::float4::text`).
  it.each([
    [0.3, '0.3'],
    [0.30000000000000004, '0.3'],
    [0.1, '0.1'],
    [16_777_217, '16777216'],
    [3.4028234663852886e38, '3.4028235e+38'],
    [1.1754943508222875e-38, '1.1754944e-38'],
    [1.401298464324817e-45, '1e-45'],
    [123_456_789_012_345_680_000, '123456790000000000000'],
    [-1.5, '-1.5'],
    [0, '0'],
    [-0, '0'],
  ])('prints %d as %s', (value, text) => {
    expect(realText(value)).toBe(text);
  });

  it('never prints the midpoint between two floats, which only an even mantissa reads back as itself', () => {
    // 50331648 = 3 x 2^24: the gap is 4, so 50331650 lies on the upper bound.
    expect(realText(50_331_648)).toBe('50331648');
    expect(realText(201_326_592)).toBe('201326590');
  });

  it('prints an integer below 2^24 whole', () => {
    expect(realText(16_777_215)).toBe('16777215');
    expect(realText(1000)).toBe('1000');
  });

  it('takes the far neighbour at a power of two, where the interval is narrower below', () => {
    // The nearest 8-digit decimal to 2^-96, 1.2621774e-29, lies below the narrow lower half.
    expect(realText(2 ** -96)).toBe('1.2621775e-29');
  });

  it('breaks a tie between two decimals of the shortest length toward an even digit', () => {
    // 2^-12 = 0.000244140625 lies halfway between 0.00024414062 and 0.00024414063.
    expect(realText(2 ** -12)).toBe('0.00024414062');
    expect(realText(float32(0x3f_80_00_00))).toBe('1');
  });

  it('reads the same text back as the same float32', () => {
    for (const bits of [
      0x00_00_00_01, 0x00_7f_ff_ff, 0x00_80_00_00, 0x7f_7f_ff_ff, 0x3e_99_99_9a,
    ]) {
      const value = float32(bits);
      expect(isStorableReal(value)).toBe(true);
      expect(Math.fround(Number(realText(value)))).toBe(value);
    }
  });
});
