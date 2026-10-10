/**
 * Exact decimal steps for boundary fixtures (SPEC 5.3): a decimal literal
 * moved by a power of ten, through `BigInt`, so a bound such as
 * `9223372036854775807` or `999.99` gets exact neighbors.
 * @packageDocumentation
 */
import { writtenFractionDigits } from '../wire/decimal';

const BASE = 10n;

/** `text` as a whole number of units of `10^-scale`; `text` has at most `scale` fraction digits. */
function toUnits(text: string, scale: number): bigint {
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split(
    '.',
  );
  const units = BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  return negative ? -units : units;
}

/** Units of `10^-scale` as canonical decimal text: no trailing fraction zeros, no `-0`. */
function fromUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units)
    .toString()
    .padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/u, '');
  const text = fraction === '' ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** `text` plus `steps` times `10^exponent`, exactly. */
export function stepDecimal(
  text: string,
  steps: number,
  exponent: number,
): string {
  const scale = Math.max(writtenFractionDigits(text), -exponent, 0);
  const step = BASE ** BigInt(scale + exponent);
  return fromUnits(toUnits(text, scale) + BigInt(steps) * step, scale);
}
