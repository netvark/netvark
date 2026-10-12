# @netvark/react-resource

React forms, lists, and query caches from
[`@netvark/resource-core`](https://github.com/netvark/netvark/tree/main/packages/resource-core)
declarations. A declared resource already knows each member's label, options, limits, and filters,
and the server's words for every refusal; this package hands them to your screens, so a form or a
table restates none of them. The root entry is a model that imports neither React nor TanStack;
TanStack Form, Query, and Table v9 read it. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 20, and the decisions behind it in
[ADR 0014](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0014-react-bindings-render-the-applications-one-messages-object.md)
and
[ADR 0015](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0015-react-bindings-a-model-under-tanstack-query-form-and-table.md).

Status: in development and unreleased. Field descriptors (`fieldsOf`) have shipped; the form model,
the list model, and the TanStack Form and TanStack Query bindings follow.

## Install

```bash
pnpm add @netvark/react-resource @netvark/resource-core
```

`@netvark/resource-core` is a peer dependency: your application declares the resources and defines
its messages with its own copy, and the bindings read those same values
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

## Rules

- Build descriptors once, at module scope, and call `label()` in render. A descriptor holds message
  functions, so with [Paraglide](https://paraglidejs.com) one built at startup renders in the locale
  of each request on the server and of each page in the browser. Never store what `label()`
  returned.
- Pass the one messages object your application defines with `defineMessages` (or
  `defaultMessages`): no provider and no hook carry it. A copy, such as an object spread of it, is
  refused, since resource-core knows checked messages by identity.
- Descriptors are frozen, through every option. Derive what a screen needs from them instead of
  changing them.
- `required` says what a create must carry. An update form's requirements come with the form model.
- `fieldsOf` throws `TypeError` before it returns for a resource no `declareResource` returned, for
  messages no definer returned, and for messages that label no member of the resource's type or not
  every member and option of it, such as messages defined for another declaration of the type.
