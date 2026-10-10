/**
 * RFC 9110 media type and `Accept` parsing (SPEC 3.1). Type, subtype, and
 * parameter names are case-insensitive and come back lowercased; parameter
 * values keep their case because `ext` and `profile` carry URIs.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.3.1 (media-type)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 (parameters)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.2 (token)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 (quoted-string)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1 (Accept)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.4.2 (weight)
 * @packageDocumentation
 */

export interface MediaTypeParameter {
  /** Lowercased: parameter names are case-insensitive (RFC 9110 5.6.6). */
  readonly name: string;
  /** Unquoted, with quoted-pairs resolved; case is left to the parameter. */
  readonly value: string;
}

export interface MediaType {
  /** Lowercased (RFC 9110 8.3.1). */
  readonly type: string;
  /** Lowercased (RFC 9110 8.3.1). */
  readonly subtype: string;
  readonly parameters: ReadonlyArray<MediaTypeParameter>;
}

/** One `Accept` list element: a media range and its quality value. */
export interface MediaRange extends MediaType {
  /** 0 to 1; 1 when no `q` parameter is present (RFC 9110 12.4.2). */
  readonly weight: number;
}

interface Scan<T> {
  readonly value: T;
  readonly end: number;
}

/** tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA */
const TCHAR = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
/** qvalue = ( "0" [ "." 0*3DIGIT ] ) / ( "1" [ "." 0*3("0") ] ) */
const QVALUE = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/u;
const DQUOTE = '"';
const BACKSLASH = '\\';

export function isToken(value: string): boolean {
  return TCHAR.test(value);
}

/** OWS = *( SP / HTAB ) */
function skipOws(input: string, from: number): number {
  let i = from;
  while (input[i] === ' ' || input[i] === '\t') {
    i += 1;
  }
  return i;
}

function readToken(input: string, from: number): Scan<string> | undefined {
  let i = from;
  while (i < input.length && TCHAR.test(input.charAt(i))) {
    i += 1;
  }
  return i === from ? undefined : { value: input.slice(from, i), end: i };
}

/**
 * qdtext = HTAB / SP / "!" / %x23-5B / %x5D-7E / obs-text;
 * quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text ). Any other octet
 * inside the quotes makes the string, and so the element, invalid.
 */
export function isQdtext(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    code >= 0x80
  );
}

function isQuotedPairChar(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    (code >= 0x21 && code <= 0x7e) ||
    code >= 0x80
  );
}

function readQuotedString(
  input: string,
  from: number,
): Scan<string> | undefined {
  if (input[from] !== DQUOTE) {
    return undefined;
  }
  let out = '';
  let i = from + 1;
  while (i < input.length) {
    const char = input.charAt(i);
    if (char === DQUOTE) {
      return { value: out, end: i + 1 };
    }
    if (char === BACKSLASH) {
      const next = input.codePointAt(i + 1) ?? 0;
      if (!isQuotedPairChar(next)) {
        return undefined;
      }
      out += input.charAt(i + 1);
      i += 2;
      continue;
    }
    if (!isQdtext(char.codePointAt(0) ?? 0)) {
      return undefined;
    }
    out += char;
    i += 1;
  }
  return undefined;
}

/** parameters = *( OWS ";" OWS [ parameter ] ); stops before "," or the end. */
function readParameters(
  input: string,
  from: number,
): Scan<Array<MediaTypeParameter>> | undefined {
  const parameters: Array<MediaTypeParameter> = [];
  let i = skipOws(input, from);
  while (input[i] === ';') {
    i = skipOws(input, i + 1);
    if (i >= input.length || input[i] === ';' || input[i] === ',') {
      // An empty parameter slot ("; ;") is allowed by the grammar.
      continue;
    }
    const name = readToken(input, i);
    if (name === undefined || input[name.end] !== '=') {
      return undefined;
    }
    const valueStart = name.end + 1;
    const value =
      readQuotedString(input, valueStart) ?? readToken(input, valueStart);
    if (value === undefined) {
      return undefined;
    }
    parameters.push({ name: name.value.toLowerCase(), value: value.value });
    i = skipOws(input, value.end);
  }
  return { value: parameters, end: i };
}

/** type "/" subtype parameters, consumed from `from` up to "," or the end. */
function readMediaType(
  input: string,
  from: number,
): Scan<MediaType> | undefined {
  const type = readToken(input, from);
  if (type === undefined || input[type.end] !== '/') {
    return undefined;
  }
  const subtype = readToken(input, type.end + 1);
  if (subtype === undefined) {
    return undefined;
  }
  const parameters = readParameters(input, subtype.end);
  if (parameters === undefined) {
    return undefined;
  }
  return {
    value: {
      type: type.value.toLowerCase(),
      subtype: subtype.value.toLowerCase(),
      parameters: parameters.value,
    },
    end: parameters.end,
  };
}

/**
 * Parses one media type, as in a `Content-Type` field. Returns `undefined`
 * when the value does not match the grammar.
 */
export function parseMediaType(value: string): MediaType | undefined {
  const start = skipOws(value, 0);
  const scanned = readMediaType(value, start);
  if (scanned === undefined || skipOws(value, scanned.end) !== value.length) {
    return undefined;
  }
  return scanned.value;
}

/** Index of the next "," outside quoted strings, or the input length. */
function nextElement(input: string, from: number): number {
  let i = from;
  let quoted = false;
  while (i < input.length) {
    const char = input[i];
    if (quoted) {
      if (char === BACKSLASH) {
        i += 1;
      } else if (char === DQUOTE) {
        quoted = false;
      }
    } else if (char === DQUOTE) {
      quoted = true;
    } else if (char === ',') {
      return i;
    }
    i += 1;
  }
  return input.length;
}

/**
 * Splits the parsed parameters into media type parameters and the weight.
 * Any parameter named `q` is the weight regardless of position (RFC 9110
 * 12.5.1); an unparseable qvalue invalidates the element.
 */
function withWeight(mediaType: MediaType): MediaRange | undefined {
  let weight = 1;
  const parameters: Array<MediaTypeParameter> = [];
  for (const parameter of mediaType.parameters) {
    if (parameter.name === 'q') {
      if (!QVALUE.test(parameter.value)) {
        return undefined;
      }
      weight = Number(parameter.value);
    } else {
      parameters.push(parameter);
    }
  }
  return { ...mediaType, parameters, weight };
}

/**
 * Parses an `Accept` field value into its media ranges in field order.
 * Empty list elements are skipped (RFC 9110 5.6.1.2) and malformed ones are
 * dropped rather than failing the whole field, so one bad element from a
 * client never turns into a 406 for the good ones.
 */
export function parseAccept(value: string): Array<MediaRange> {
  const ranges: Array<MediaRange> = [];
  let i = 0;
  while (i < value.length) {
    i = skipOws(value, i);
    if (value[i] === ',') {
      i += 1;
      continue;
    }
    if (i >= value.length) {
      break;
    }
    const boundary = nextElement(value, i);
    const scanned = readMediaType(value, i);
    if (scanned !== undefined && skipOws(value, scanned.end) === boundary) {
      const range = withWeight(scanned.value);
      if (range !== undefined) {
        ranges.push(range);
      }
    }
    i = boundary + 1;
  }
  return ranges;
}
