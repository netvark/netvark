/**
 * The tree `parseExpression` builds from a deparsed CHECK expression (SPEC
 * 8.2). A cast keeps its type as printed, such as `character varying` or
 * `other.level`, so callers compare spellings exactly.
 * @packageDocumentation
 */

/** The operators the tree keeps; `~` and its variants bind tighter than the comparisons. */
export type BinaryOperator =
  | '='
  | '<>'
  | '<'
  | '<='
  | '>'
  | '>='
  | '~'
  | '~*'
  | '!~'
  | '!~*';

/** A parsed expression. */
export type SqlNode =
  | { readonly kind: 'or' | 'and'; readonly terms: ReadonlyArray<SqlNode> }
  | {
      readonly kind: 'binary';
      readonly operator: BinaryOperator;
      readonly left: SqlNode;
      readonly right: SqlNode;
    }
  | { readonly kind: 'any'; readonly left: SqlNode; readonly right: SqlNode }
  | {
      readonly kind: 'nullTest';
      readonly negated: boolean;
      readonly operand: SqlNode;
    }
  | {
      readonly kind: 'call';
      readonly schema: string | null;
      readonly name: string;
      readonly args: ReadonlyArray<SqlNode>;
    }
  | { readonly kind: 'cast'; readonly operand: SqlNode; readonly type: string }
  | { readonly kind: 'array'; readonly elements: ReadonlyArray<SqlNode> }
  | {
      readonly kind: 'identifier';
      readonly name: string;
      readonly quoted: boolean;
    }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly text: string };
