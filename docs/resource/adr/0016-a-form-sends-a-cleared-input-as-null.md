# ADR 0016: A form sends a cleared input as `null`, nullable or not

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0015 decided that a form's write carries the members whose value differs from the value the form
started from, and that "a blank becomes `null` where the member is nullable and is left out where it
is not". Building the form model over the fixture of SPEC 20.8 showed what the second half does on
update. A person clears a contact's name, a member that is not nullable, and submits: the blank is
left out, so the write carries nothing for `name`, the write validator has nothing to refuse, the
server answers `200`, and the stored name stays. The form showed an empty input, the submit
succeeded, and the change the person made was dropped without a word. On create the clause changes
nothing visible: a required member left out is refused as missing, and a member with a default is
left out anyway when the person leaves it alone.

Omission already has a meaning. JSON:API reads a member a `PATCH` leaves out as unchanged, and ADR
0004 makes the write omit what the person did not change, so a database default applies on create
and the stored value stays on update. Clearing an input is a change, so omitting it gives it the
meaning of no change. `null` is the value the write forms give a cleared member (SPEC 5.1): a
nullable member stores it, and a member that is not nullable refuses it with the issue kind
`required` (SPEC 6.1, step 4), the same kind a create gets for a required member left out, at the
member's own path.

@ref https://jsonapi.org/format/1.1/#crud-updating-resource-attributes @ref
https://jsonapi.org/format/1.1/#crud-updating-to-one-relationships

## Decision

- Every member the write carries goes in its wire form, and a blank, the value of a cleared input
  (`''`, `null` for a boolean, `undefined` for a JSON value), goes as `null` whether the member is
  nullable or not. ADR 0015's clause that a blank "is left out where it is not" is withdrawn; the
  rest of ADR 0015 stands.
- Which members the write carries does not change: those whose value differs from the start, and on
  create every required member. A blank the person left alone is not carried, so it never becomes
  `null`.
- A member that is not nullable refuses `null` in the form's validator with `required`, which the
  form shows on the member as ADR 0015 words every issue on a blank value.

## Consequences

A cleared input is either written or refused on its own field, so a submit never reports success for
a change the server did not make. A form cannot keep a stored value by clearing its input; a screen
that means "leave as it is" leaves the member out of `members` or keeps its value. The server never
sees the refused `null`: `write(values)` throws for values the validator refuses, and TanStack Form
submits only accepted values. SPEC 20.3 states the rule; `form/form-write.test.ts` and
`form/form-validator-texts.test.ts` hold it.
