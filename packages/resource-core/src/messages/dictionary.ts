/**
 * Checked messages as maps, built once per `localizeErrors` (SPEC 10.4).
 * A code, a member, or an option value read from a response is looked up
 * in a `ReadonlyMap`, so a name that came from a request never meets
 * `Object.prototype`.
 * @packageDocumentation
 */
import type { CheckedMessages } from './define-messages';
import type { MessageIndex } from './message-index';
import type { ConstraintInputs, ErrorText, Label, Messages } from './types';

/** Checked messages and the maps their lookups go through. */
export interface Dictionary {
  readonly messages: Messages;
  readonly index: MessageIndex;
  /** The texts of each code that has its own. */
  readonly errors: ReadonlyMap<string, ErrorText<ConstraintInputs>>;
  /** Each type's member labels. */
  readonly labels: ReadonlyMap<string, ReadonlyMap<string, Label>>;
  /** Each type's option labels, per field. */
  readonly options: ReadonlyMap<
    string,
    ReadonlyMap<string, ReadonlyMap<string, Label>>
  >;
}

function mapOf<TValue>(
  record: Readonly<Record<string, TValue | undefined>>,
): ReadonlyMap<string, TValue> {
  return new Map(
    Object.entries(record).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );
}

/** The maps of `checked`. */
export function dictionaryOf({ messages, index }: CheckedMessages): Dictionary {
  return {
    messages,
    index,
    errors: mapOf(messages.errors),
    labels: new Map(
      Object.entries(messages.fields).map(([type, labels]) => [
        type,
        mapOf(labels),
      ]),
    ),
    options: new Map(
      Object.entries(messages.options).map(([type, fields]) => [
        type,
        new Map(
          Object.entries(fields).map(([field, labels]) => [
            field,
            mapOf(labels),
          ]),
        ),
      ]),
    ),
  };
}
