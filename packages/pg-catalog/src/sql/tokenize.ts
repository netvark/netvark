/**
 * A tokenizer for the SQL PostgreSQL's deparser prints (SPEC 8.2):
 * `pg_get_expr`, `pg_get_constraintdef`, and the like. It covers what the
 * deparser emits for expressions and rejects the rest (comments, dollar
 * quotes, parameters, prefixed string constants) by returning `null`, so
 * callers never read a constant they do not fully understand.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html
 * @packageDocumentation
 */

type TokenKind =
  | 'word'
  | 'identifier'
  | 'string'
  | 'number'
  | 'operator'
  | 'punctuation';

/**
 * One token. `text` is the unescaped value for strings and quoted
 * identifiers, and the source text otherwise; `start` and `end` are UTF-16
 * offsets into the input.
 */
export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const WORD = /^[A-Za-z_][A-Za-z0-9_$]*/u;
const NUMBER = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
const OPERATOR = /^[+\-*/<>=~!@#%^&|`?]+/u;
const WHITESPACE = /^[ \t\n\r]+/u;
const PUNCTUATION = new Set(['(', ')', '[', ']', ',', ';', '.']);
/** Letters that make a following quote a prefixed constant (`E'..'`, `B'..'`, `X'..'`, `N'..'`, `U&'..'`). */
const PREFIXES = new Set(['E', 'e', 'B', 'b', 'X', 'x', 'N', 'n', 'U', 'u']);

/** Reads a quoted run starting at `start`; doubled quotes stand for one. */
function quoted(
  sql: string,
  start: number,
  quote: string,
): { text: string; end: number } | null {
  let text = '';
  let index = start + 1;
  while (index < sql.length) {
    const next = sql.indexOf(quote, index);
    if (next < 0) {
      return null;
    }
    text += sql.slice(index, next);
    if (sql[next + 1] === quote) {
      text += quote;
      index = next + 2;
    } else {
      return { text, end: next + 1 };
    }
  }
  return null;
}

/** Deparsed expressions are short, so slicing per token costs nothing measurable. */
function match(pattern: RegExp, sql: string, start: number): string | null {
  return pattern.exec(sql.slice(start))?.[0] ?? null;
}

function readToken(sql: string, start: number): Token | null {
  const character = sql.charAt(start);
  if (character === "'" || character === '"') {
    const run = quoted(sql, start, character);
    if (run === null) {
      return null;
    }
    return { kind: character === "'" ? 'string' : 'identifier', ...run, start };
  }
  if (sql.startsWith('::', start)) {
    return { kind: 'punctuation', text: '::', start, end: start + 2 };
  }
  if (PUNCTUATION.has(character)) {
    return { kind: 'punctuation', text: character, start, end: start + 1 };
  }
  const word = match(WORD, sql, start);
  if (word !== null) {
    const end = start + word.length;
    const prefixed = sql.charAt(end) === "'" || sql.startsWith("&'", end);
    return prefixed && PREFIXES.has(word)
      ? null
      : { kind: 'word', text: word, start, end };
  }
  const number = match(NUMBER, sql, start);
  if (number !== null) {
    return { kind: 'number', text: number, start, end: start + number.length };
  }
  const operator = match(OPERATOR, sql, start);
  if (
    operator !== null &&
    !operator.includes('--') &&
    !operator.includes('/*')
  ) {
    return {
      kind: 'operator',
      text: operator,
      start,
      end: start + operator.length,
    };
  }
  return null;
}

/** The tokens of deparsed SQL, or `null` for text outside what the deparser prints. */
export function tokenize(sql: string): ReadonlyArray<Token> | null {
  const tokens: Array<Token> = [];
  let index = 0;
  while (index < sql.length) {
    const space = match(WHITESPACE, sql, index);
    if (space === null) {
      const token = readToken(sql, index);
      if (token === null) {
        return null;
      }
      tokens.push(token);
      index = token.end;
    } else {
      index += space.length;
    }
  }
  return tokens;
}
