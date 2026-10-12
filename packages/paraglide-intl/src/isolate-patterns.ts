/**
 * The pattern rewrite (SPEC 6.2, ADR 0006, ADR 0007): in the messages of
 * the isolated locales, every expression of a pattern of two or more parts
 * goes between U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL
 * ISOLATE, as two text parts around it. A pattern of one part is left as
 * it is, as Fluent leaves a placeable that is the whole message. Bundles
 * are read as the inlang SDK returns them, and every field the rewrite
 * does not change is kept, so the SDK writes them back as they were.
 * @ref https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates
 * @ref https://github.com/opral/inlang/blob/main/packages/sdk/src/json-schema/pattern.ts (Pattern: text, expression, and markup parts)
 * @packageDocumentation
 */
import {
  FIRST_STRONG_ISOLATE,
  POP_DIRECTIONAL_ISOLATE,
} from '@netvark/intl-core';

import { isRecord } from './internal/is-record';

/** A part of an inlang pattern: `text`, `expression`, or markup. */
export interface PatternPart {
  readonly type: string;
}

interface Variant {
  readonly pattern: ReadonlyArray<PatternPart>;
}

interface Message {
  readonly locale: string;
  readonly variants: ReadonlyArray<Variant>;
}

/** The fields of an SDK bundle the rewrite reads; the SDK's other fields are kept. */
export interface Bundle {
  readonly id: string;
  readonly messages: ReadonlyArray<Message>;
}

function isPart(value: unknown): value is PatternPart {
  return isRecord(value) && typeof value['type'] === 'string';
}

function isVariant(value: unknown): value is Variant {
  const pattern = isRecord(value) ? value['pattern'] : undefined;
  return Array.isArray(pattern) && pattern.every((part) => isPart(part));
}

function isMessage(value: unknown): value is Message {
  const variants = isRecord(value) ? value['variants'] : undefined;
  return (
    isRecord(value) &&
    typeof value['locale'] === 'string' &&
    Array.isArray(variants) &&
    variants.every((variant) => isVariant(variant))
  );
}

/** Whether `value` is a bundle with its messages and variants, as `selectBundleNested()` returns one. */
export function isBundle(value: unknown): value is Bundle {
  const messages = isRecord(value) ? value['messages'] : undefined;
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    Array.isArray(messages) &&
    messages.every((message) => isMessage(message))
  );
}

function text(value: string): PatternPart & { readonly value: string } {
  return { type: 'text', value };
}

/** `pattern` with each expression isolated; the same array when nothing changes. */
export function isolatePattern(
  pattern: ReadonlyArray<PatternPart>,
): ReadonlyArray<PatternPart> {
  if (
    pattern.length < 2 ||
    !pattern.some((part) => part.type === 'expression')
  ) {
    return pattern;
  }
  return pattern.flatMap((part) =>
    part.type === 'expression'
      ? [text(FIRST_STRONG_ISOLATE), part, text(POP_DIRECTIONAL_ISOLATE)]
      : [part],
  );
}

function isolateMessage(message: Message): Message {
  const variants = message.variants.map((variant) => {
    const pattern = isolatePattern(variant.pattern);
    return pattern === variant.pattern ? variant : { ...variant, pattern };
  });
  return variants.every((variant, index) => variant === message.variants[index])
    ? message
    : { ...message, variants };
}

/** `bundle` with the messages of `locales` isolated, or `undefined` when no pattern changes. */
export function isolateBundle(
  bundle: Bundle,
  locales: ReadonlySet<string>,
): Bundle | undefined {
  const messages = bundle.messages.map((message) =>
    locales.has(message.locale) ? isolateMessage(message) : message,
  );
  return messages.every((message, index) => message === bundle.messages[index])
    ? undefined
    : { ...bundle, messages };
}
