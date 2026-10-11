/**
 * A fixture's value as the rules report shows it (SPEC 10.3): JSON where
 * JSON writes the value as itself, JavaScript's notation where it does
 * not, so no value is shown as another. A registry's fixtures are any
 * JavaScript values, and JSON writes `NaN` as `null`, drops an
 * `undefined` member, and has no text for a symbol, a bigint, or a cycle.
 * @ref https://tc39.es/ecma262/#sec-json.stringify
 * @packageDocumentation
 */

/** An object or an array, `[cycle]` where it holds itself. */
function container(value: object, open: Set<object>): string {
  if (open.has(value)) {
    return '[cycle]';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? 'Date(invalid)'
      : `Date(${value.toISOString()})`;
  }
  open.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item: unknown) => show(item, open)).join(',')}]`;
    }
    const members = Object.entries(value).map(
      ([key, item]) => `${JSON.stringify(key)}:${show(item, open)}`,
    );
    return `{${members.join(',')}}`;
  } finally {
    open.delete(value);
  }
}

function show(value: unknown, open: Set<object>): string {
  if (typeof value === 'object') {
    return value === null ? 'null' : container(value, open);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return value.name === '' ? '[function]' : `[function ${value.name}]`;
  }
  // A boolean, or undefined.
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/**
 * `value` as JSON text where it is a JSON value, a string's control
 * characters escaped; otherwise `NaN`, `-0`, `10n`, `undefined`,
 * `Symbol(x)`, `[function f]`, `Date(2026-01-05T09:00:00.000Z)`, and
 * `[cycle]` in its JSON-like place.
 */
export function showValue(value: unknown): string {
  return show(value, new Set());
}
