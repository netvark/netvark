/**
 * The token cursor the expression parser reads through. A parse that leaves
 * the subject of SPEC 8.2 throws `Unparsable`, which `parseExpression`
 * turns into `null`.
 * @packageDocumentation
 */
import type { Token } from './tokenize';

/** Deparsed CHECKs nest a few levels; the limit keeps hostile input from exhausting the stack. */
const MAX_DEPTH = 64;

export class Unparsable extends Error {
  public constructor() {
    super('the expression is outside what the deparser prints');
  }
}

export class TokenCursor {
  private readonly tokens: ReadonlyArray<Token>;
  private index = 0;
  private depth = 0;

  public constructor(tokens: ReadonlyArray<Token>) {
    this.tokens = tokens;
  }

  public get done(): boolean {
    return this.index === this.tokens.length;
  }

  public peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  public take(): Token {
    const token = this.tokens[this.index];
    if (token === undefined) {
      throw new Unparsable();
    }
    this.index += 1;
    return token;
  }

  /** Whether the token at `offset` is the punctuation or operator `text`; strings and quoted identifiers never are. */
  public sees(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return (
      (token?.kind === 'punctuation' || token?.kind === 'operator') &&
      token.text === text
    );
  }

  /** Whether the next token is the keyword, in any case. */
  public seesKeyword(keyword: string): boolean {
    const token = this.peek();
    return token?.kind === 'word' && token.text.toUpperCase() === keyword;
  }

  /** Consumes the token `sees(text)` matches, or throws. */
  public expect(text: string): Token {
    if (!this.sees(text)) {
      throw new Unparsable();
    }
    return this.take();
  }

  /** Consumes the keyword when it is next, and says whether it was. */
  public acceptKeyword(keyword: string): boolean {
    const seen = this.seesKeyword(keyword);
    if (seen) {
      this.index += 1;
    }
    return seen;
  }

  /** Consumes `text` when it is next, and says whether it was. */
  public accept(text: string): boolean {
    const seen = this.sees(text);
    if (seen) {
      this.index += 1;
    }
    return seen;
  }

  /** Runs `read` one nesting level deeper. */
  public nested<TValue>(read: () => TValue): TValue {
    if (this.depth >= MAX_DEPTH) {
      throw new Unparsable();
    }
    this.depth += 1;
    const value = read();
    this.depth -= 1;
    return value;
  }
}
