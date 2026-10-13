import type { AnyFieldApi } from '@tanstack/react-form';
import type { ReactElement } from 'react';

/**
 * The inputs the screen tests' forms render (resource SPEC 20.8): a
 * labeled control per TanStack Form field, its error, once the field is
 * touched, the first error's `message`, described by the control as
 * WAI-ARIA describes an error, so a test finds it from the control as a
 * person's screen reader does. Not published with the package.
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 * @packageDocumentation
 */
import type { FieldOption } from '@netvark/resource-ui';

/** A field and the label its control shows. */
export interface InputProps {
  readonly field: AnyFieldApi;
  readonly label: string;
}

/** A choice's field, its label, and its options. */
export interface ChoiceProps extends InputProps {
  readonly options: ReadonlyArray<
    Pick<FieldOption, 'value'> & { readonly label: () => string }
  >;
}

/** The first error's text of a touched field. */
function errorOf(field: AnyFieldApi): string | undefined {
  const [first] = field.state.meta.errors as ReadonlyArray<
    { readonly message?: string } | undefined
  >;
  return field.state.meta.isTouched ? first?.message : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The error under a control, and the attributes that tie the control to it. */
function described(field: AnyFieldApi) {
  const error = errorOf(field);
  const id = `${field.name}-error`;
  return {
    attributes: {
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : id,
    },
    message: error === undefined ? null : <p id={id}>{error}</p>,
  };
}

/** A text input. */
export function TextInput({ field, label }: InputProps): ReactElement {
  const { attributes, message } = described(field);
  return (
    <div>
      <label htmlFor={field.name}>{label}</label>
      <input
        id={field.name}
        name={field.name}
        value={textOf(field.state.value)}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        onBlur={field.handleBlur}
        {...attributes}
      />
      {message}
    </div>
  );
}

/** A choice of one option, or none. */
export function ChoiceInput({
  field,
  label,
  options,
}: ChoiceProps): ReactElement {
  const { attributes, message } = described(field);
  return (
    <div>
      <label htmlFor={field.name}>{label}</label>
      <select
        id={field.name}
        name={field.name}
        value={textOf(field.state.value)}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        onBlur={field.handleBlur}
        {...attributes}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
      {message}
    </div>
  );
}
