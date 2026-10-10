/**
 * A parser for the boolean expressions PostgreSQL's deparser prints for
 * CHECK constraints (SPEC 8.2): `OR`, `AND`, comparisons, `= ANY (...)`,
 * `IS [NOT] NULL`, function calls, casts, `ARRAY[...]`, parentheses,
 * identifiers, and constants. Anything else, `NOT` and `COLLATE` included,
 * gives `null`, so the recognizer only ever sees trees it fully understands.
 * Precedence follows PostgreSQL's operator table, though the deparser
 * parenthesizes every operator expression anyway.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-PRECEDENCE
 * @packageDocumentation
 */
import type { BinaryOperator, SqlNode } from './nodes';
import type { Token } from './tokenize';

import { TokenCursor, Unparsable } from './cursor';
import { tokenize } from './tokenize';
import { readTypeName } from './type-name';

const COMPARISONS: ReadonlySet<string> = new Set([
  '=',
  '<>',
  '<',
  '<=',
  '>',
  '>=',
]);
/** `~` and its variants are "any other operator" to PostgreSQL: tighter than the comparisons, left-associative. */
const MATCHES: ReadonlySet<string> = new Set(['~', '~*', '!~', '!~*']);
/** Keywords that are never an identifier or a function name in operand position. */
const RESERVED: ReadonlySet<string> = new Set([
  'ALL',
  'AND',
  'ANY',
  'ARRAY',
  'FALSE',
  'IS',
  'NOT',
  'NULL',
  'OR',
  'SOME',
  'TRUE',
]);

function isBinaryOperator(text: string): text is BinaryOperator {
  return COMPARISONS.has(text) || MATCHES.has(text);
}

function binary(operator: string, left: SqlNode, right: SqlNode): SqlNode {
  if (!isBinaryOperator(operator)) {
    throw new Unparsable();
  }
  return { kind: 'binary', operator, left, right };
}

/** One node for `a OR b OR c`; nested nodes of the same kind flatten, since both operators are associative. */
function combine(kind: 'or' | 'and', terms: ReadonlyArray<SqlNode>): SqlNode {
  const [only] = terms;
  if (terms.length === 1 && only !== undefined) {
    return only;
  }
  return {
    kind,
    terms: terms.flatMap((term) => (term.kind === kind ? term.terms : [term])),
  };
}

class Parser {
  private readonly sql: string;
  private readonly cursor: TokenCursor;

  public constructor(sql: string, tokens: ReadonlyArray<Token>) {
    this.sql = sql;
    this.cursor = new TokenCursor(tokens);
  }

  public parse(): SqlNode {
    const node = this.or();
    if (!this.cursor.done) {
      throw new Unparsable();
    }
    return node;
  }

  private or(): SqlNode {
    const terms = [this.and()];
    while (this.cursor.acceptKeyword('OR')) {
      terms.push(this.and());
    }
    return combine('or', terms);
  }

  private and(): SqlNode {
    const terms = [this.is()];
    while (this.cursor.acceptKeyword('AND')) {
      terms.push(this.is());
    }
    return combine('and', terms);
  }

  /** `IS [NOT] NULL` binds looser than the comparisons; a leading `NOT` fails the parse. */
  private is(): SqlNode {
    if (this.cursor.seesKeyword('NOT')) {
      throw new Unparsable();
    }
    let node = this.comparison();
    while (this.cursor.acceptKeyword('IS')) {
      const negated = this.cursor.acceptKeyword('NOT');
      if (!this.cursor.acceptKeyword('NULL')) {
        throw new Unparsable();
      }
      node = { kind: 'nullTest', negated, operand: node };
    }
    return node;
  }

  /** Comparisons do not associate: `a < b < c` is an error in PostgreSQL. */
  private comparison(): SqlNode {
    const left = this.match();
    const token = this.cursor.peek();
    if (token?.kind !== 'operator' || !COMPARISONS.has(token.text)) {
      return left;
    }
    this.cursor.take();
    const node = this.cursor.acceptKeyword('ANY')
      ? this.any(token.text, left)
      : binary(token.text, left, this.match());
    const next = this.cursor.peek();
    if (next?.kind === 'operator' && COMPARISONS.has(next.text)) {
      throw new Unparsable();
    }
    return node;
  }

  private any(operator: string, left: SqlNode): SqlNode {
    if (operator !== '=') {
      throw new Unparsable();
    }
    this.cursor.expect('(');
    const right = this.cursor.nested(() => this.or());
    this.cursor.expect(')');
    return { kind: 'any', left, right };
  }

  private match(): SqlNode {
    let node = this.postfix();
    let token = this.cursor.peek();
    while (token?.kind === 'operator' && MATCHES.has(token.text)) {
      this.cursor.take();
      node = binary(token.text, node, this.postfix());
      token = this.cursor.peek();
    }
    return node;
  }

  private postfix(): SqlNode {
    let node = this.primary();
    while (this.cursor.accept('::')) {
      node = {
        kind: 'cast',
        operand: node,
        type: readTypeName(this.cursor, this.sql),
      };
    }
    return node;
  }

  private primary(): SqlNode {
    const token = this.cursor.take();
    if (token.kind === 'string') {
      return { kind: 'string', value: token.text };
    }
    if (token.kind === 'number') {
      return { kind: 'number', text: token.text };
    }
    if (token.kind === 'identifier') {
      return this.reference(token.text, true);
    }
    if (token.kind === 'word') {
      return this.word(token.text);
    }
    if (token.text !== '(') {
      throw new Unparsable();
    }
    const node = this.cursor.nested(() => this.or());
    this.cursor.expect(')');
    return node;
  }

  private word(text: string): SqlNode {
    const keyword = text.toUpperCase();
    if (keyword === 'ARRAY' && this.cursor.accept('[')) {
      const elements = this.cursor.nested(() => this.list(']'));
      return { kind: 'array', elements };
    }
    if (RESERVED.has(keyword)) {
      throw new Unparsable();
    }
    return this.reference(text, false);
  }

  /** An identifier, or a function call when `(` follows, possibly qualified by a schema. */
  private reference(name: string, quoted: boolean): SqlNode {
    if (this.cursor.accept('.')) {
      const member = this.cursor.take();
      if (member.kind !== 'word' && member.kind !== 'identifier') {
        throw new Unparsable();
      }
      // A CHECK never qualifies a column, so only a function call has a qualifier.
      return this.call(name, member.text);
    }
    return this.cursor.sees('(')
      ? this.call(null, name)
      : { kind: 'identifier', name, quoted };
  }

  private call(schema: string | null, name: string): SqlNode {
    this.cursor.expect('(');
    const args = this.cursor.nested(() => this.list(')'));
    return { kind: 'call', schema, name, args };
  }

  /** Comma-separated expressions up to `close`, which it consumes. */
  private list(close: string): ReadonlyArray<SqlNode> {
    const items: Array<SqlNode> = [];
    if (!this.cursor.sees(close)) {
      items.push(this.or());
      while (this.cursor.accept(',')) {
        items.push(this.or());
      }
    }
    this.cursor.expect(close);
    return items;
  }
}

/** The tree of a deparsed expression, or `null` for text outside SPEC 8.2. Never throws. */
export function parseExpression(sql: string): SqlNode | null {
  const tokens = tokenize(sql);
  if (tokens === null) {
    return null;
  }
  try {
    return new Parser(sql, tokens).parse();
  } catch (error) {
    if (error instanceof Unparsable) {
      return null;
    }
    throw error;
  }
}
