/**
 * RFC 9110 media type serialization (SPEC 3.1): the inverse of `parse.ts`.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 (parameters)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 (quoted-string)
 * @packageDocumentation
 */
import type { MediaType } from './parse';

import { isQdtext, isToken } from './parse';

const DQUOTE = '"';
const BACKSLASH = '\\';

/**
 * Serializes a value as a quoted-string with `"` and `\` escaped as
 * quoted-pairs. Throws on a value that no quoted-string can carry (control
 * characters other than HTAB).
 */
export function quoteParameterValue(value: string): string {
  let out = DQUOTE;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === DQUOTE || char === BACKSLASH) {
      out += BACKSLASH + char;
    } else if (isQdtext(code)) {
      out += char;
    } else {
      throw new TypeError(
        `Media type parameter value ${JSON.stringify(value)} cannot be represented as a quoted-string`,
      );
    }
  }
  return out + DQUOTE;
}

/** A token as-is, anything else as a quoted-string. */
export function formatParameterValue(value: string): string {
  return value !== '' && isToken(value) ? value : quoteParameterValue(value);
}

/** `type/subtype; name=value; ...`, one space after each semicolon. */
export function formatMediaType(mediaType: MediaType): string {
  let out = `${mediaType.type}/${mediaType.subtype}`;
  for (const parameter of mediaType.parameters) {
    out += `; ${parameter.name}=${formatParameterValue(parameter.value)}`;
  }
  return out;
}
