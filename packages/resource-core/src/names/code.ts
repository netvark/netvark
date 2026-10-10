/**
 * Error codes (SPEC 4.1, 4.2, 17): a rule key upper-cased with
 * `String.prototype.toUpperCase`, or the rule's `code`, and either must
 * match `CODE_PATTERN`. `Uppercase` applies the same function in types, and
 * `IsCode` is the type-level twin of the pattern, pinned to it by one case
 * table (`test-support/code-cases.ts`).
 * @ref https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html#uppercasestringtype
 * @packageDocumentation
 */
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';

/** What a code must match (SPEC 17). */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

/** The code a rule key derives: the key upper-cased. */
export function deriveCode(key: string): string {
  return key.toUpperCase();
}

/** Whether `code` matches `CODE_PATTERN`. */
export function isCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

type CodeLetter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z';
type CodeCharacter =
  | '_'
  | CodeLetter
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9';

/** Whether every character is a letter, a digit, or `_`. */
type IsCodeTail<TText extends string> =
  TText extends `${infer THead}${infer TRest}`
    ? THead extends CodeCharacter
      ? IsCodeTail<TRest>
      : false
    : true;

/** Whether a literal code matches `CODE_PATTERN`; `true` for `string`, which the runtime checks. */
export type IsCode<TCode extends string> = string extends TCode
  ? true
  : TCode extends `${CodeLetter}${infer TRest}`
    ? IsCodeTail<TRest>
    : false;

type Rules<TDecl extends Declaration> = DeclaredMembers<TDecl, 'rules'>;

/** The `code` the declaration gives key `K`, or `undefined`. */
type GivenCode<TDecl extends Declaration, K> = K extends keyof Rules<TDecl>
  ? MemberOf<Rules<TDecl>[K], 'code'>
  : undefined;

/** The code of rule key `K`: its `code`, or the key upper-cased. */
export type CodeOf<TDecl extends Declaration, K extends string> =
  GivenCode<TDecl, K> extends string ? GivenCode<TDecl, K> : Uppercase<K>;
