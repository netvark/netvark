# @netvark/react-resource

React forms, lists, and query caches from
[`@netvark/resource-core`](https://github.com/netvark/netvark/tree/main/packages/resource-core)
declarations. A declared resource already knows each member's label, options, limits, and filters,
and the server's words for every refusal; this package hands them to your screens, so a form or a
table restates none of them. The root entry is a model that imports neither React nor TanStack;
TanStack Form, Query, and Table v9 read it. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 20, and the decisions behind it in
[ADR 0014](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0014-react-bindings-render-the-applications-one-messages-object.md),
[ADR 0015](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0015-react-bindings-a-model-under-tanstack-query-form-and-table.md),
and
[ADR 0016](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0016-a-form-sends-a-cleared-input-as-null.md).

Status: in development and unreleased. Field descriptors (`fieldsOf`) and the form model
(`resourceForm`) have shipped; the list model and the TanStack Form and TanStack Query bindings
follow.

## Install

```bash
pnpm add @netvark/react-resource @netvark/resource-core @netvark/jsonapi-client
```

`@netvark/resource-core` and `@netvark/jsonapi-client` are peer dependencies: your application
declares the resources and defines its messages with its own copy of the one, and calls its API and
catches its errors with its own copy of the other, and the bindings read those same values
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
The root entry runs wherever JavaScript does, so server rendering on Node 22.12+, Bun, Deno, and
Cloudflare Workers reads the same model as the browser.

## Field descriptors

`fieldsOf(resource, messages)` describes each public field and relationship, the fields and then the
relationships, in declaration order, keyed by public name:

```ts
// src/contacts/fields.ts
import { fieldsOf } from '@netvark/react-resource';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const contactFields = fieldsOf(Contacts, messages);
```

A descriptor holds `name`, `label`, `options`, `required`, `sortable`, `filter`, and `meta`, the
member's field metadata. `label` is the label function your messages hold for the member, and each
option's `label` the one they hold for the option: functions, never texts. Call them where you
render:

```tsx
import { contactFields } from './fields';

export function StatusInput() {
  const { status } = contactFields;
  return (
    <>
      <label htmlFor={status.name}>{status.label()}</label>
      <select id={status.name} name={status.name}>
        {status.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
    </>
  );
}
```

`filter` is `null` for a member that declares no `filter`; otherwise `filter.kind` names the control
a filter of the member takes and `filter.operators` the conditions it may write, the member's
declared `filter` in order:

| `filter.kind` | The member                                                        | A control such as                |
| ------------- | ----------------------------------------------------------------- | -------------------------------- |
| `reference`   | a relationship                                                    | a choice of the target's records |
| `options`     | has options, or is an array whose elements have them              | a choice, single or multiple     |
| `values`      | is an array without options                                       | a list of values                 |
| `boolean`     | is a boolean                                                      | yes, no, or either               |
| `number`      | is a number, including `int8` and `numeric`, which travel as text | a value or a range               |
| `date`        | is a date, a timestamp, or a timestamp with time zone             | a date or a range                |
| `text`        | is anything else                                                  | a text box                       |

The kind picks the control, and the operators say what it writes: a multiple choice among `options`
writes `{ in: [...] }` where `in` is declared, a `number` range `{ gte, lte }`, a `text` box
`{ startsWithi }`.

## Field rules

- Build descriptors once, at module scope, and call `label()` in render. A descriptor holds message
  functions, so with [Paraglide](https://paraglidejs.com) one built at startup renders in the locale
  of each request on the server and of each page in the browser. Never store what `label()`
  returned.
- Pass the one messages object your application defines with `defineMessages` (or
  `defaultMessages`): no provider and no hook carry it. A copy, such as an object spread of it, is
  refused, since resource-core knows checked messages by identity.
- Descriptors are frozen, through every option. Derive what a screen needs from them instead of
  changing them.
- `required` says what a create must carry. An update form's descriptors are never `required`; its
  members are only checked when the person changes them.
- `fieldsOf` throws `TypeError` before it returns for a resource no `declareResource` returned, for
  messages no definer returned, and for messages that label no member of the resource's type or not
  every member and option of it, such as messages defined for another declaration of the type.

## Forms

`resourceForm(resource, operation, options)` is a framework-free model of a create or an update
form: the members it holds, the values it starts from, a validator, the write the values make, and
where a refused write's errors land. A create form starts from the declaration's defaults, so build
it once:

```ts
// src/contacts/forms.ts
import { resourceForm } from '@netvark/react-resource';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const createContact = resourceForm(Contacts, 'create', { messages });
```

An update form starts from the record it edits, as the client read it:

```ts
const { data: contact } = await clients.contacts.get(id);
const editContact = resourceForm(Contacts, 'update', { messages, record: contact });
```

`members` narrows a form to the public names it lists, such as `['status']` for a status switch; by
default it holds every member the operation writes, in declaration order.

| The model       | What it is                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`        | the descriptors of the members it holds (see above), each `required` as the operation requires it                                                               |
| `defaultValues` | what the form starts from: on create each member's default as a read gives it, else its blank, on update the record's values; frozen                            |
| `validator`     | a synchronous [Standard Schema](https://standardschema.dev) of the values: the declaration's own write validator, each issue on its field in the server's words |
| `write(values)` | what the client's `create` or `update` takes: the members the person changed, in their wire forms                                                               |
| `errors(error)` | a refused write's texts, `{ fields, form }`: one per field the server refused, and the rest for a banner                                                        |

A value is what its input edits: text for every string, number, date, and relationship id, `true`,
`false`, or `null` for a boolean until it is set, a list of texts for an array, and a JSON member's
value as it is. A cleared input is blank: `''`, `null` for a boolean, `undefined` for a JSON member.

A form library that takes a Standard Schema as its form validator, such as
[TanStack Form](https://tanstack.com/form/v1/docs/framework/react/guides/validation), puts each
issue on the field its path names. A submit handler writes and maps a refusal:

```ts
async function submit(values: typeof createContact.defaultValues) {
  try {
    await clients.contacts.create(createContact.write(values));
  } catch (error) {
    const { fields, form } = createContact.errors(error);
    // fields.email under the email input, form in a banner,
    // and the screen's own text when both are empty
  }
}
```

## Form rules

- Validate before you write. `write(values)` throws `TypeError` for values the validator refuses,
  since a submit handler should only ever receive accepted ones; TanStack Form submits only those.
- Send what `write` returns, nothing more. It carries only the members the person changed, so a
  database default applies to every member left alone on create, and every stored value the person
  did not touch stays on update. Never spread the record into a write.
- A cleared input is sent as `null`, nullable or not: a member that is not nullable refuses it as
  required on its field, so a submit never reports success for a change the server did not make. To
  keep a stored value, leave the input as it is, or leave the member out of `members`.
- Show `errors(error)` as it comes: `fields` under their inputs and `form` in a banner, in the words
  the server localized for the request's `Accept-Language`. When both are empty, as for a network
  failure or a `500` without an error document, show your own text; an error's `message` is for
  logs.
- Texts render when the validator runs, so with Paraglide a locale change shows on the next
  validation, and the server's refusals arrive in the language the transport sent.
- A rule across members, such as a CHECK over two columns, runs on the client only when the write
  carries all of them. An update that changes one leaves the rest to their stored values, which only
  the server sees, so the server refuses it and its error lands by pointer: keep such members in one
  form.
- An integer or number input holds text: the write sends a number when the text is a finite JSON
  number, and the validator refuses `1e999` or `01` with the server's words. A `date-time` member
  needs its offset; convert a `datetime-local` input's value before it reaches the form.
- `resourceForm` throws `TypeError` before it returns for an operation the resource does not serve,
  options that do not fit the operation (a `record` on create, none on update, a member the
  operation does not write), and a record that lacks a member the form holds or holds another kind
  of value; each names the member, never the value.
