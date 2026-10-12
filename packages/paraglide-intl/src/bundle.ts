/**
 * The inlang SDK's bundle as `selectBundleNested()` returns it, as far as
 * the binding reads it (SPEC 6.1): its `id`, its `declarations`, and each
 * message's `locale` and variants' `pattern`. SDK 2.7 to 4 share these
 * shapes and keep the declarations on the bundle; SDK 4 renamed only the
 * columns that link the rows (`bundle_id`, `message_id`), which the binding
 * never reads. A bundle is checked before it is read, and fields it does
 * not read are kept, so it is written back as it was.
 * @ref https://github.com/opral/inlang/blob/main/packages/sdk/src/json-schema/pattern.ts (Expression, Declaration)
 * @packageDocumentation
 */
import { isRecord } from './internal/is-record';

/** A part of a pattern: `text`, `expression`, or markup. */
export interface PatternPart {
  readonly type: string;
}

/** A function annotating an expression, such as `number` or `plural`. */
interface FunctionReference {
  readonly type: 'function-reference';
  readonly name: string;
}

/** An expression part: a variable or a literal, with an optional function. */
export interface Expression extends PatternPart {
  readonly type: 'expression';
  readonly arg:
    | { readonly type: 'variable-reference'; readonly name: string }
    | { readonly type: 'literal'; readonly value: string };
  readonly annotation?: FunctionReference | undefined;
}

/** A declaration of a bundle: `input-variable`, `local-variable`, or another. */
interface Declaration {
  readonly type: string;
  readonly name: string;
}

/** A local declaration: a name bound to an expression. */
export interface LocalVariable extends Declaration {
  readonly type: 'local-variable';
  readonly value: Expression;
}

interface Variant {
  readonly pattern: ReadonlyArray<PatternPart>;
}

interface Message {
  readonly locale: string;
  readonly variants: ReadonlyArray<Variant>;
}

/** The fields of a bundle the binding reads. */
export interface Bundle {
  readonly id: string;
  readonly declarations: ReadonlyArray<Declaration>;
  readonly messages: ReadonlyArray<Message>;
}

function isArg(value: unknown): value is Expression['arg'] {
  return (
    isRecord(value) &&
    ((value['type'] === 'variable-reference' &&
      typeof value['name'] === 'string') ||
      (value['type'] === 'literal' && typeof value['value'] === 'string'))
  );
}

function isAnnotation(value: unknown): value is FunctionReference | undefined {
  return (
    value === undefined ||
    (isRecord(value) &&
      value['type'] === 'function-reference' &&
      typeof value['name'] === 'string')
  );
}

/** Whether `value` is an expression part with a readable argument and annotation. */
export function isExpression(value: unknown): value is Expression {
  return (
    isRecord(value) &&
    value['type'] === 'expression' &&
    isArg(value['arg']) &&
    isAnnotation(value['annotation'])
  );
}

/** Whether `value` is a local declaration whose expression is readable. */
export function isLocalVariable(value: unknown): value is LocalVariable {
  return (
    isRecord(value) &&
    value['type'] === 'local-variable' &&
    typeof value['name'] === 'string' &&
    isExpression(value['value'])
  );
}

function isPart(value: unknown): value is PatternPart {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    (value['type'] !== 'expression' || isExpression(value))
  );
}

function isDeclaration(value: unknown): value is Declaration {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['name'] === 'string' &&
    (value['type'] !== 'local-variable' || isLocalVariable(value))
  );
}

function isVariant(value: unknown): value is Variant {
  return (
    isRecord(value) &&
    Array.isArray(value['pattern']) &&
    value['pattern'].every((part) => isPart(part))
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    typeof value['locale'] === 'string' &&
    Array.isArray(value['variants']) &&
    value['variants'].every((variant) => isVariant(variant))
  );
}

/** Whether `value` is a bundle with its declarations, messages, and variants, as `selectBundleNested()` returns one. */
export function isBundle(value: unknown): value is Bundle {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    Array.isArray(value['declarations']) &&
    value['declarations'].every((declaration) => isDeclaration(declaration)) &&
    Array.isArray(value['messages']) &&
    value['messages'].every((message) => isMessage(message))
  );
}
