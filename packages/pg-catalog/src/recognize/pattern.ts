/**
 * The pattern subset of SPEC 8.4: the regular expressions PostgreSQL's
 * advanced syntax and JavaScript's, with the flags `su`, read identically.
 * `^` and `$` anchor at the ends of the string in both (PostgreSQL is not
 * newline-sensitive by default; JavaScript without `m` anchors only there);
 * `.` and a negated bracket match any character, newline included, and
 * match code points, as PostgreSQL does in a UTF-8 database. Bracket ranges
 * stay within ASCII digits and letters, which keeps them independent of the
 * collation. Every construct the grammar accepts is valid JavaScript with
 * `su`, so an accepted pattern always compiles.
 * @ref https://www.postgresql.org/docs/18/functions-matching.html#POSIX-SYNTAX-DETAILS
 * @ref https://tc39.es/ecma262/#sec-regexp-regular-expression-objects
 * @packageDocumentation
 */

/** JavaScript's SyntaxCharacter: what an unescaped literal may not be. */
const SYNTAX: ReadonlySet<string> = new Set([
  '^',
  '$',
  '\\',
  '.',
  '*',
  '+',
  '?',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '|',
]);
/** The identity escapes JavaScript allows with `u`; PostgreSQL reads any escaped non-alphanumeric as itself. */
const ESCAPABLE: ReadonlySet<string> = new Set([...SYNTAX, '/']);
/** Inside a bracket JavaScript with `u` also allows `\-`. */
const CLASS_ESCAPABLE: ReadonlySet<string> = new Set([...ESCAPABLE, '-']);
/** Characters a bracket item may not be unescaped: `]` and `-` are positional, `[` and `^` stay out for clarity. */
const CLASS_RESERVED: ReadonlySet<string> = new Set(['\\', ']', '[', '-', '^']);
const RANGES: ReadonlyArray<readonly [string, string]> = [
  ['0', '9'],
  ['a', 'z'],
  ['A', 'Z'],
];
/** PostgreSQL's `DUPMAX`: a bound above it is an error there. */
const MAX_BOUND = 255;
/** Groups nest a few levels in practice; the limit keeps hostile input from exhausting the stack. */
const MAX_DEPTH = 64;

function isQuantifier(character: string | undefined): boolean {
  return (
    character === '*' ||
    character === '+' ||
    character === '?' ||
    character === '{'
  );
}

function isRange(low: string, high: string): boolean {
  return RANGES.some(
    ([first, last]) => first <= low && low <= high && high <= last,
  );
}

class PatternReader {
  private readonly characters: ReadonlyArray<string>;
  private index = 0;

  public constructor(pattern: string) {
    // Code points, not UTF-16 units: with `u` an astral character is one atom.
    this.characters = Array.from(pattern);
  }

  public readAll(): boolean {
    return this.pattern(0) && this.index === this.characters.length;
  }

  private peek(offset = 0): string | undefined {
    return this.characters[this.index + offset];
  }

  private take(): string | undefined {
    const character = this.characters[this.index];
    this.index += 1;
    return character;
  }

  private pattern(depth: number): boolean {
    if (!this.branch(depth)) {
      return false;
    }
    while (this.peek() === '|') {
      this.index += 1;
      if (!this.branch(depth)) {
        return false;
      }
    }
    return true;
  }

  private branch(depth: number): boolean {
    for (;;) {
      const character = this.peek();
      if (character === undefined || character === '|' || character === ')') {
        return true;
      }
      if (!this.piece(character, depth)) {
        return false;
      }
    }
  }

  /** An atom and an optional quantifier; `^` and `$` take none. */
  private piece(character: string, depth: number): boolean {
    this.index += 1;
    if (character === '^' || character === '$') {
      return !isQuantifier(this.peek());
    }
    return this.atom(character, depth) && this.quantifier();
  }

  /** The atom that starts with `character`, which `piece` has consumed. */
  private atom(character: string, depth: number): boolean {
    switch (character) {
      case '(': {
        return this.group(depth);
      }
      case '[': {
        return this.bracket();
      }
      case '.': {
        return true;
      }
      case '\\': {
        const escaped = this.take();
        return escaped !== undefined && ESCAPABLE.has(escaped);
      }
      default: {
        return !SYNTAX.has(character);
      }
    }
  }

  /** `(pattern)` or `(?:pattern)`; any other `(?` is an option, a lookaround, or worse. */
  private group(depth: number): boolean {
    if (depth >= MAX_DEPTH) {
      return false;
    }
    if (this.peek() === '?') {
      if (this.peek(1) !== ':') {
        return false;
      }
      this.index += 2;
    }
    if (!this.pattern(depth + 1) || this.peek() !== ')') {
      return false;
    }
    this.index += 1;
    return true;
  }

  /** An optional quantifier with an optional lazy `?`; a second quantifier is an error in both. */
  private quantifier(): boolean {
    const character = this.peek();
    if (character === '{') {
      if (!this.bound()) {
        return false;
      }
    } else if (isQuantifier(character)) {
      this.index += 1;
    } else {
      return true;
    }
    if (this.peek() === '?') {
      this.index += 1;
    }
    return !isQuantifier(this.peek());
  }

  /** `{m}`, `{m,}`, or `{m,n}` with `m <= n <= 255`. */
  private bound(): boolean {
    this.index += 1;
    const low = this.digits();
    let high = low;
    if (this.peek() === ',') {
      this.index += 1;
      high = this.peek() === '}' ? low : this.digits();
    }
    if (this.take() !== '}' || low === null || high === null) {
      return false;
    }
    return low <= high && high <= MAX_BOUND;
  }

  private digits(): number | null {
    let text = '';
    for (
      let next = this.peek();
      next !== undefined && next >= '0' && next <= '9';
      next = this.peek()
    ) {
      text += next;
      this.index += 1;
    }
    return text === '' ? null : Number(text);
  }

  /**
   * `[`, an optional `^`, then items, where a `-` may stand first or last
   * as itself (both read it so) and nowhere else, then `]`. A `]` first is
   * a literal in PostgreSQL but an empty class in JavaScript, so it fails.
   */
  private bracket(): boolean {
    if (this.peek() === '^') {
      this.index += 1;
    }
    let items = 0;
    if (this.peek() === '-') {
      this.index += 1;
      items += 1;
    }
    for (;;) {
      const character = this.peek();
      if (character === ']') {
        this.index += 1;
        return items > 0;
      }
      if (character === '-' && this.peek(1) === ']') {
        this.index += 1;
      } else if (!this.bracketItem()) {
        return false;
      }
      items += 1;
    }
  }

  /** A literal, an escaped syntax character, or an ASCII range such as `a-f`. */
  private bracketItem(): boolean {
    const character = this.take();
    if (character === '\\') {
      const escaped = this.take();
      return escaped !== undefined && CLASS_ESCAPABLE.has(escaped);
    }
    if (character === undefined || CLASS_RESERVED.has(character)) {
      return false;
    }
    if (this.peek() !== '-' || this.peek(1) === ']') {
      return true;
    }
    this.index += 1;
    const high = this.take();
    return high !== undefined && isRange(character, high);
  }
}

/**
 * The rule's `source` for a PostgreSQL pattern: the pattern unchanged when
 * it lies entirely within SPEC 8.4, otherwise `null`.
 */
export function translatePattern(pattern: string): string | null {
  return new PatternReader(pattern).readAll() ? pattern : null;
}
