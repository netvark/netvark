# @netvark/react-resource

[TanStack Form](https://tanstack.com/form/v1) and [TanStack Query](https://tanstack.com/query/v5)
bindings for React over
[`@netvark/resource-ui`](https://github.com/netvark/netvark/tree/main/packages/resource-ui#readme)'s
form models and
[`@netvark/jsonapi-client`](https://github.com/netvark/netvark/tree/main/packages/jsonapi-client#readme)'s
clients. `@netvark/react-resource/form` gives a form a model's values and validator and puts a
refused write's texts on their fields; `@netvark/react-resource/query` turns a client into query
options keyed by the request each read sends. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 20, and the decisions behind it in
[ADR 0015](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0015-react-bindings-a-model-under-tanstack-query-form-and-table.md)
and
[ADR 0017](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0017-a-refusal-of-several-fields-binds-where-a-change-to-any-clears-it.md).

Status: in development and unreleased, and to be retired:
[ADR 0018](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0018-forms-and-lists-are-a-model-and-a-tanstack-form-binding-in-two-packages.md)
moves `./form` to `@netvark/tanstack-form-resource` and `./query` to
`@netvark/tanstack-query-jsonapi`, which serve every TanStack adapter.

## Install

```bash
pnpm add @netvark/react-resource @netvark/resource-ui @netvark/resource-core @netvark/jsonapi-client
pnpm add @tanstack/react-form @tanstack/react-query
```

`@netvark/resource-ui`, `@netvark/resource-core`, and `@netvark/jsonapi-client` are peer
dependencies: the bindings read the models, declarations, and clients your application makes with
its own copies
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
`@netvark/react-resource/form` needs TanStack Form 1.17 or later and `@netvark/react-resource/query`
TanStack Query 5.89 or later, each an optional peer that only its entry imports.

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

## TanStack Query

`@netvark/react-resource/query` turns a client into
[TanStack Query](https://tanstack.com/query/v5/docs/framework/react/overview) options.
`resourceQueries(client)` gives each read and write of one resource, made with TanStack Query's own
`queryOptions`, `infiniteQueryOptions`, and `mutationOptions` and keyed by the request it sends.
Make them once per resource, beside the clients:

```ts
// src/api/queries.ts
import { resourceQueries } from '@netvark/react-resource/query';

import { clients } from './clients';

export const contacts = resourceQueries(clients.contacts);
export const meetings = resourceQueries(clients.meetings);
```

```tsx
// src/contacts/contact-list.tsx
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';

import { contacts, meetings } from '../api/queries';

export function ContactList() {
  const list = useInfiniteQuery(contacts.pages({ sort: ['name'], page: { size: 25 } }));
  // Removing a contact sets their meetings' contact to null, so the meetings refetch too.
  const remove = useMutation(contacts.remove({ invalidates: [meetings.all] }));
  if (list.isPending) {
    return <p>Loading</p>;
  }
  if (list.isError) {
    return <p role="alert">The contacts could not be loaded.</p>;
  }
  return (
    <>
      <ul>
        {list.data.pages
          .flatMap((page) => page.data)
          .map((contact) => (
            <li key={contact.id}>
              {contact.name}
              <button disabled={remove.isPending} onClick={() => remove.mutate(contact.id)}>
                Remove
              </button>
            </li>
          ))}
      </ul>
      {list.hasNextPage && (
        <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          More
        </button>
      )}
    </>
  );
}
```

| Member                                      | Give it to          | Key                                                  |
| ------------------------------------------- | ------------------- | ---------------------------------------------------- |
| `contacts.list(query)`                      | `useQuery`          | `['contacts', 'list', <query string>]`               |
| `contacts.pages(query)`                     | `useInfiniteQuery`  | `['contacts', 'pages', <query string>]`              |
| `contacts.get(id, query)`                   | `useQuery`          | `['contacts', 'get', id, <include, fields>]`         |
| `contacts.create()`, `update()`, `remove()` | `useMutation`       | `['contacts', 'create']` and so on, as `mutationKey` |
| `contacts.all`                              | `invalidateQueries` | `['contacts']`, every list, page, and record         |

A read resolves to the client's result: the records in `data`, the document's `links` and `meta`
beside them, each record typed by the query's `include` and `fields`. A write resolves once every
read it invalidated has refetched, so its `isPending` covers the refresh, and `remove` drops the
record's own entries first, so a screen still showing it does not ask the server for it again.

## TanStack Query rules

- Make the options once per resource, at module scope, and call a member where you read. The key is
  the query string the request sends: two queries that send one request share one entry, whatever
  order their members are written in, while a filter whose fields come in another order is another
  request. Build a screen's query in one place, such as its route's search.
- Name the other resources a write changes on the server in `invalidates`, such as the meetings a
  contact's removal touches, or the record a database trigger updates. Never invalidate in a
  callback passed to `mutate`: TanStack Query runs one only while the component that called it is
  mounted, and for the last of consecutive calls only. Keep those callbacks for what the screen does
  next, such as navigating.
- Add options by spreading: `useQuery({ ...contacts.get(id), staleTime: 30_000 })`. Never override a
  write's `onSuccess`, which holds its invalidation.
- Do not retry a refusal. In the browser TanStack Query retries a failed query three times by
  default, and a `4xx` answers the same each time; set `retry` in the `QueryClient`'s defaults:
  `retry: (failures, error) => failures < 3 && !(isResponseError(error) && error.status < 500)`. A
  read the server refused settles with the client's `ResponseError`, which `isResponseError` reads.
- Page an infinite list with `fetchNextPage` and `fetchPreviousPage`. It starts at the query's own
  `page.after` or `page.before`, keeps its `page.size`, follows the server's links, and ends a
  direction at a page without records.
- Prefetch in a route loader with the same options: `queryClient.ensureQueryData(contacts.get(id))`,
  or from TanStack Query 5.102, which deprecates it,
  `queryClient.query({ ...contacts.get(id), staleTime: 'static' })`. Keys and results are JSON, so
  `dehydrate` and a persister take them as they are.
- `resourceQueries` throws `TypeError` for a value `createClients` did not return, `pages` for a
  resource that does not paginate, and a write for `invalidates` that is not a list of keys:
  `[meetings.all]`, not `meetings.all`.
