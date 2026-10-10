/**
 * The next representable number up or down, in double and in single
 * precision: a float bound's neighbors (SPEC 5.3). The bit pattern of an
 * IEEE 754 number orders like its magnitude, so a neighbor is one unit in
 * the last place away.
 * @ref https://en.wikipedia.org/wiki/IEEE_754#Representation_and_encoding_in_memory
 * @packageDocumentation
 */

/** The smallest positive single-precision number, a subnormal. */
export const FLOAT4_MIN = 1.401_298_464_324_817e-45;

/** The largest single-precision number. */
export const FLOAT4_MAX = 3.402_823_466_385_288_6e38;

const DOUBLE_BYTES = 8;
const SINGLE_BYTES = 4;

/** The double next to `value` in `direction`; a finite value only. */
export function nextDouble(value: number, direction: 1 | -1): number {
  if (value === 0) {
    return direction * Number.MIN_VALUE;
  }
  const view = new DataView(new ArrayBuffer(DOUBLE_BYTES));
  view.setFloat64(0, value);
  const away = value > 0 === direction > 0;
  view.setBigUint64(0, view.getBigUint64(0) + (away ? 1n : -1n));
  return view.getFloat64(0);
}

/** The single-precision number next to `Math.fround(value)` in `direction`. */
export function nextSingle(value: number, direction: 1 | -1): number {
  const rounded = Math.fround(value);
  if (rounded === 0) {
    return direction * FLOAT4_MIN;
  }
  const view = new DataView(new ArrayBuffer(SINGLE_BYTES));
  view.setFloat32(0, rounded);
  const away = rounded > 0 === direction > 0;
  view.setUint32(0, view.getUint32(0) + (away ? 1 : -1));
  return view.getFloat32(0);
}
