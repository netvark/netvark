/**
 * PostgreSQL's one-dimensional array literals, both ways (SPEC 18.2): the
 * elements of one the server printed, `NULL` unquoted being the null
 * element, and one the server reads back, of the non-null elements of a
 * write form (resource SPEC 5.1), each double-quoted with `\` and `"`
 * escaped, so any text survives.
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 * @packageDocumentation
 */

const NULL_ELEMENT = 'NULL';

/** A quoted element from `start`, the opening quote, and the index after its closing quote. */
function quotedElement(body: string, start: number): readonly [string, number] {
  let value = '';
  let at = start + 1;
  while (at < body.length && body[at] !== '"') {
    if (body[at] === '\\') {
      at += 1;
    }
    value += body.charAt(at);
    at += 1;
  }
  return [value, at + 1];
}

/**
 * The elements of a one-dimensional array literal, `null` for `NULL`;
 * `undefined` for any other text, a nested array or explicit bounds among
 * them.
 */
export function arrayElements(
  text: string,
): ReadonlyArray<string | null> | undefined {
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return undefined;
  }
  const body = text.slice(1, -1);
  if (body === '') {
    return [];
  }
  const elements: Array<string | null> = [];
  let at = 0;
  while (at <= body.length) {
    if (body[at] === '{') {
      return undefined;
    }
    if (body[at] === '"') {
      const [value, next] = quotedElement(body, at);
      elements.push(value);
      at = next;
    } else {
      const end = body.includes(',', at) ? body.indexOf(',', at) : body.length;
      const raw = body.slice(at, end);
      elements.push(raw === NULL_ELEMENT ? null : raw);
      at = end;
    }
    at += 1;
  }
  return elements;
}

/** An array literal of `elements`, each double-quoted and escaped. */
export function arrayLiteral(elements: ReadonlyArray<string>): string {
  const written = elements.map(
    (element) => `"${element.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
  );
  return `{${written.join(',')}}`;
}
