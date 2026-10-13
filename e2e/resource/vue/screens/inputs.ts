/**
 * The inputs the Vue screens' forms render, as `react/screens/inputs.tsx`
 * renders React's: a labeled control per TanStack Form field and, once the
 * field is touched, its first error's `message`, which the control names
 * with `aria-describedby`. Vue Form's `Field` hands its default slot a
 * field whose `state` reads reactive selectors of the field's store, so
 * the slot renders again when the field's value or errors change.
 * @ref https://tanstack.com/form/v1/docs/framework/vue/quick-start
 * @ref https://vuejs.org/guide/extras/render-function.html#passing-slots
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 */
import type { AnyFieldApi } from '@tanstack/vue-form';
import type { VNode } from 'vue';

import { h } from 'vue';

/** What Vue Form's `Field` hands its default slot. */
export interface FieldSlot {
  readonly field: AnyFieldApi;
}

function messageOf(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A text input over `field` and the label it shows. `AnyFieldApi` types
 * a field's name, value, and errors as `any`.
 */
export function textInput(field: AnyFieldApi, label: string): VNode {
  const name = textOf(field.name);
  const errors: ReadonlyArray<unknown> = field.state.meta.errors;
  const error = field.state.meta.isTouched ? messageOf(errors[0]) : undefined;
  const id = `${name}-error`;
  return h('div', [
    h('label', { for: name }, label),
    h('input', {
      id: name,
      name,
      value: textOf(field.state.value),
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : id,
      onInput: (event: Event) => {
        if (event.target instanceof HTMLInputElement) {
          field.handleChange(event.target.value);
        }
      },
      onBlur: field.handleBlur,
    }),
    error === undefined ? null : h('p', { id }, error),
  ]);
}
