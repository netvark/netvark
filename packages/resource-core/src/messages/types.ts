/**
 * The shape of an application's messages (SPEC 10.1): for every code a
 * response can carry, a title and a detail; for each constraint kind the
 * derived codes have, a title and a detail they share; a message per issue
 * kind; a label per public member; and a label per option. Every message
 * is a function, so a Paraglide message function (`m.max_length`) is one
 * as it stands and the i18n library, not resource-core, picks the locale
 * and the plural form. `MessagesFor` types the messages of a list of
 * resources; `Messages` is any messages object, as `localizeErrors` takes
 * it.
 * @ref https://paraglidejs.com/basics#dynamic-messages
 * @packageDocumentation
 */
import type { ConstraintKind } from '../errors/error-entry';
import type { IssueKind } from '../schema/issue-kinds';

/**
 * A message without inputs: an error's title, constant per code (RFC 9457
 * 3.1.3), or the label of a member or an option.
 * @ref https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3
 */
export type Label = () => string;

/** A message from its inputs to text, such as a Paraglide message function. */
export type Message<TInputs extends object> = (inputs: TInputs) => string;

/**
 * What every detail receives: the label of the member the error object
 * points at, or an empty string when it points at none the request's
 * resource has. A name the client sent is never one.
 */
export interface CodeInputs {
  readonly field: string;
}

/** What the detail of a constraint kind, and of a derived code, also receives: the labels of the constraint's members, joined with `, `. */
export interface ConstraintInputs extends CodeInputs {
  readonly fields: string;
}

/** The inputs of an issue kind whose keyword has a value: the value as text. */
type Keyword<TName extends string> = CodeInputs & {
  readonly [K in TName]: string;
};

/** What each issue kind's message receives (SPEC 10.3). */
export interface IssueInputs {
  readonly required: CodeInputs;
  readonly type: Keyword<'type'>;
  readonly format: Keyword<'format'>;
  readonly minLength: Keyword<'limit'>;
  readonly maxLength: Keyword<'limit'>;
  readonly minimum: Keyword<'limit'>;
  readonly maximum: Keyword<'limit'>;
  readonly exclusiveMinimum: Keyword<'limit'>;
  readonly exclusiveMaximum: Keyword<'limit'>;
  readonly multipleOf: Keyword<'limit'>;
  /** `values`: the labels of the allowed options, joined with `, `. */
  readonly enum: Keyword<'values'>;
  readonly pattern: CodeInputs;
  readonly additionalProperties: CodeInputs;
}

/** An error's title and detail. */
export interface ErrorText<TInputs extends object> {
  readonly title: Label;
  readonly detail: Message<TInputs>;
}

/** Any messages object `defineMessages` returns. */
export interface Messages {
  /** Per code; a derived code may leave its texts to its constraint kind's. */
  readonly errors: {
    readonly [code: string]: ErrorText<ConstraintInputs> | undefined;
  };
  /** Per constraint kind the resources' derived codes have. */
  readonly constraints: {
    readonly [K in ConstraintKind]?: ErrorText<ConstraintInputs>;
  };
  /** Per issue kind. */
  readonly validation: {
    readonly [K in IssueKind]: Message<IssueInputs[K]>;
  };
  /** Per resource type, a label per public field and relationship. */
  readonly fields: {
    readonly [type: string]: { readonly [member: string]: Label };
  };
  /** Per resource type, per field with options, a label per option. */
  readonly options: {
    readonly [type: string]: {
      readonly [field: string]: { readonly [option: string]: Label };
    };
  };
}
