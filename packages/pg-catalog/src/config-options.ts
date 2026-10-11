/**
 * The helpers each option's validation shares (SPEC 11.1): every mistake
 * throws a `TypeError` that starts with `defineExtraction: ` and names the
 * option by its path.
 * @packageDocumentation
 */

type Options = Readonly<Record<string, unknown>>;

export function fail(message: string): never {
  throw new TypeError(`defineExtraction: ${message}`);
}

export function isOptions(value: unknown): value is Options {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function member(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** An object of options; with `keys`, any other key is a mistake. */
export function options(
  value: unknown,
  path: string,
  keys?: ReadonlyArray<string>,
): Options {
  if (!isOptions(value)) {
    fail(`${path} must be an object`);
  }
  const unknown = Object.keys(value).find(
    (key) => keys !== undefined && !keys.includes(key),
  );
  if (unknown !== undefined) {
    fail(`${member(path, unknown)} is not an option`);
  }
  return value;
}

export function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    fail(`${path} must be a string`);
  }
  if (value === '') {
    fail(`${path} must not be empty`);
  }
}

export function textOrFunction(value: unknown, path: string): void {
  if (typeof value !== 'function' && typeof value !== 'string') {
    fail(`${path} must be a string or a function`);
  }
  if (value === '') {
    fail(`${path} must not be empty`);
  }
}

export function texts(value: unknown, path: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  const seen = new Set<string>();
  value.forEach((item: unknown, index) => {
    text(item, `${path}[${index}]`);
    if (seen.has(item)) {
      fail(`${path} lists ${item} twice`);
    }
    seen.add(item);
  });
  return [...seen];
}
