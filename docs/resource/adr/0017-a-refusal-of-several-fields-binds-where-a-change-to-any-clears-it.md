# ADR 0017: A refusal of several fields binds where a change to any of them clears it

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0015 decided that TanStack Form's binding "writes them into `errorMap.onSubmit` and clears the
previous ones", on the ground that TanStack Form clears a field's `onSubmit` error "when the field
is validated again for another cause without an error, which is when its value changes". Building
`bindResponseErrors` over TanStack Form 1.33.5 tested both against forms made with
`new FormApi(...)` and their fields, and against the contacts application over HTTP:

- A field validates when its value changes and when it loses focus, and either clears its `onSubmit`
  error. Another field's change or blur leaves it.
- A field's `onServer` error from the form (`errorSourceMap.onServer` `'form'`) is cleared by the
  form's own validation, which runs when any field changes or loses focus, as long as the form has a
  form-level validator. `revalidateLogic()` runs no validation at all for a form without validators,
  so on such a form the error stays.
- Either error makes its field invalid, and a submit runs only when every field is valid. TanStack
  Form validates the fields before the form, so the submit itself clears neither: a submit of the
  same values is blocked until the error goes.
- Several members are refused together by a unique constraint over two columns, by an exclusion
  constraint, by a CHECK over several columns, and by a domain CHECK whose violation names no
  column, and the server gives one error object per member (SPEC 9.1, 9.5). The contacts
  application's `meetings_no_double_booking` refuses a booking of a room for an overlapping period
  with a 409 on `room` and on `during`. Bound into `onSubmit`, the room keeps its text after the
  person moves the meeting to a free period, and blocks every submit until the room is changed or
  loses focus, though nothing conflicts any more.
- Error objects are independent in JSON:API, and the model holds one text per member (SPEC 20.4), so
  no rule tells one refusal of two members from two refusals: the objects of one refusal share their
  code and detail, but every schema issue shares `VALIDATION_FAILED`.
- TanStack Form's `AnyFormApi` is not a type every form passes for. The `FormApi` type parameters
  are declared `in out`, and a form made without `onSubmitMeta` has the submit meta `never`, so a
  type test refused the `formApi` a submit handler receives.

@ref https://tanstack.com/form/v1/docs/framework/react/guides/validation @ref
https://tanstack.com/form/v1/docs/framework/react/guides/dynamic-validation @ref
https://tanstack.com/form/v1/docs/reference/classes/FormApi @ref
https://jsonapi.org/format/1.1/#error-objects

## Decision

- **A refusal of one field is its `onSubmit` error.** When a response's texts land on one field,
  `bindResponseErrors` sets it as that field's `errorMap.onSubmit`, from the form. It outlasts the
  other fields' changes, blocks a submit, and goes when its field changes or loses focus.
- **A refusal of several fields is their `onServer` error.** When a response's texts land on several
  fields, each is its field's `errorMap.onServer`, from the form, which the form's validation clears
  when any field changes or loses focus: changing any one of them may answer the refusal. Until then
  they block a submit. The form needs a form-level validator, which `resourceFormOptions(model)`
  gives it.
- **The response is the unit.** The binding does not group the texts by code or by detail. Two
  refusals of one response read as one only clear sooner, and after a submit the validator flags
  again, at the next change, what it can check.
- **A text lands where the form has a field.** A member the form holds but has no field meta for,
  because no field was ever rendered for it, gives its text to the form's texts, for the banner, so
  it is seen and blocks nothing.
- **A binding replaces its own texts only.** It clears the texts the binding before it set, known by
  identity, and leaves every other error in either slot. It returns what it bound: the text of each
  field it set, and the form's texts.
- **The form is a structural type.** `bindResponseErrors` takes `BindableForm<TValues>`: the form's
  values, which tie it to the model it was made from, and the two methods it calls, typed so that
  every `FormApi` is one, whatever its validators and submit meta.

This replaces ADR 0015's clause "TanStack Form's binding writes them into `errorMap.onSubmit` and
clears the previous ones" and its claim that a field's `onSubmit` error clears only when its value
changes; the rest of ADR 0015 stands.

## Consequences

A person who answers a refusal of two members by changing either can submit again at once, and a
refusal of one member still holds until that member changes. The texts of a refusal of several
fields go at the next interaction with any field, one that cannot answer it too; until then they are
on every field the refusal names. A form built without `resourceFormOptions` and without a
form-level validator would keep such texts, so the binding is documented for forms made from the
model. `isSubmitSuccessful` stays `true` after a refused write, as ADR 0015 says, and a screen reads
the refusal from what `bindResponseErrors` returned. SPEC 20.5 states the rules;
`tanstack-form/bind-errors.test.ts`, `tanstack-form/bind-errors-result.test.ts`,
`tanstack-form/form-binding.test-d.ts`, and `e2e/resource/react/form-binding.e2e.test.ts` hold them.
The floors job, which runs the package's tests on the oldest TanStack Form the peer range admits
(SPEC 20.9), holds that release to the same behavior.
