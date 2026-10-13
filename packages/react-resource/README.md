# @netvark/react-resource

[TanStack Form](https://tanstack.com/form/v1) bindings for React over
[`@netvark/resource-ui`](https://github.com/netvark/netvark/tree/main/packages/resource-ui#readme)'s
form models. `@netvark/react-resource/form` gives a form a model's values and validator and puts a
refused write's texts on their fields. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 20, and the decisions behind it in
[ADR 0015](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0015-react-bindings-a-model-under-tanstack-query-form-and-table.md)
and
[ADR 0017](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0017-a-refusal-of-several-fields-binds-where-a-change-to-any-clears-it.md).
TanStack Query options for the clients' calls, for every adapter, are
[`@netvark/tanstack-query-jsonapi`](https://github.com/netvark/netvark/tree/main/packages/tanstack-query-jsonapi#readme).

Status: in development and unreleased, and to be retired:
[ADR 0018](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0018-forms-and-lists-are-a-model-and-a-tanstack-form-binding-in-two-packages.md)
moves `./form` to `@netvark/tanstack-form-resource`, which serves every TanStack Form adapter.

## Install

```bash
pnpm add @netvark/react-resource @netvark/resource-ui @netvark/resource-core @netvark/jsonapi-client
pnpm add @tanstack/react-form
```

`@netvark/resource-ui`, `@netvark/resource-core`, and `@netvark/jsonapi-client` are peer
dependencies: the binding reads the models, declarations, and errors your application makes with its
own copies
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
`@netvark/react-resource/form` needs TanStack Form 1.17 or later, an optional peer.

## TanStack Form

`@netvark/react-resource/form` hands a form model to
[TanStack Form](https://tanstack.com/form/v1/docs/framework/react/guides/validation). Build the
model with
[`@netvark/resource-ui`](https://github.com/netvark/netvark/tree/main/packages/resource-ui#forms)'s
`resourceForm`:

```ts
// src/contacts/forms.ts
import { resourceForm } from '@netvark/resource-ui';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const createContact = resourceForm(Contacts, 'create', { messages });
```

`resourceFormOptions(model)` gives the form the model's values and its validator, run when the form
is first submitted and on every change after, so nobody meets an error before submitting.
`bindResponseErrors(formApi, model, error)` puts a refused write's texts on their fields and returns
them, with the ones no field holds for a banner:

```tsx
// src/contacts/create-contact.tsx
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';

import { bindResponseErrors, resourceFormOptions } from '@netvark/react-resource/form';

import { clients } from '../api/clients';
import { createContact } from './forms';

export function CreateContact() {
  const [banner, setBanner] = useState<ReadonlyArray<string>>([]);
  const form = useForm({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      setBanner([]);
      try {
        await clients.contacts.create(createContact.write(value));
      } catch (error) {
        const refusal = bindResponseErrors(formApi, createContact, error);
        const placed = Object.keys(refusal.fields).length > 0 || refusal.form.length > 0;
        setBanner(placed ? refusal.form : ['The contact could not be saved. Try again.']);
      }
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {banner.map((text) => (
        <p key={text} role="alert">
          {text}
        </p>
      ))}
      {createContact.fields.map((descriptor) => (
        <form.Field key={descriptor.name} name={descriptor.name}>
          {(field) => (
            <label>
              {descriptor.label()}
              <input
                value={String(field.state.value ?? '')}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched && field.state.meta.errors[0]?.message}
            </label>
          )}
        </form.Field>
      ))}
      <button type="submit">Save</button>
    </form>
  );
}
```

A real screen renders each member with the control its descriptor calls for; the loop keeps the
example short. `resourceFormOptions(model)` spreads into the `useAppForm` of `createFormHook` the
same way, so your own field components keep working.

Where a refusal lands, and when it goes (ADR 0017):

| The server refuses                                                                 | The text is the field's | It goes when                           |
| ---------------------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| one field, such as a taken email                                                   | `errorMap.onSubmit`     | that field changes or loses focus      |
| several fields together, such as a room booked twice for one period (room, period) | `errorMap.onServer`     | any field of the form changes or blurs |
| a member the form holds but renders no field for, or no member                     | the returned `form`     | the next binding                       |

Either field error blocks the next submit until it goes, so the values the server refused are not
sent again unchanged.

## TanStack Form rules

- Spread `resourceFormOptions(model)` and add your own options after it, never in place of its
  `validators` or `validationLogic`: they run the model's validator, and the form's own validation
  is what clears a refusal of several fields. A form without a form-level validator keeps it.
- Render a field for every member the model holds, and pass `members` to hold fewer. A validator
  issue on a member without a field blocks the submit unseen; the binding sends such a member's
  refusal to the banner instead.
- Bind in the submit handler's `catch`, with the `formApi` it receives, and show the returned `form`
  texts in a banner. When `fields` and `form` are both empty, as for a network failure or a `500`
  without an error document, show your own text; an error's `message` is for logs.
- Read a refusal from what `bindResponseErrors` returned, never from `isSubmitSuccessful`: TanStack
  Form sets it to `true` once the handler resolves, and a handler that catches the refusal resolves.
- Render `field.state.meta.errors[0]?.message`. Every error a field holds is an object with a
  `message`, the validator's issue and the server's text alike; the binding marks the field touched,
  so a field that shows its errors once touched shows a refusal too.
- A field shows the server's text in the language the transport sent with the request, as the server
  localized it, and the validator's texts in the locale of the moment they ran.
- `resourceFormOptions` and `bindResponseErrors` throw `TypeError` for a model no `resourceForm`
  returned, and `bindResponseErrors` for a form that is no TanStack Form `FormApi`. The form's
  values must hold the model's members; TypeScript refuses a form made from another model.
