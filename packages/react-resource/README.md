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
[ADR 0016](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0016-a-form-sends-a-cleared-input-as-null.md),
and
[ADR 0017](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0017-a-refusal-of-several-fields-binds-where-a-change-to-any-clears-it.md).

Status: in development and unreleased. Field descriptors (`fieldsOf`), the form model
(`resourceForm`), its TanStack Form binding (`@netvark/react-resource/form`), the TanStack Query
binding (`@netvark/react-resource/query`), and the list model for TanStack Table (`resourceList`)
have shipped.

## Install

```bash
pnpm add @netvark/react-resource @netvark/resource-core @netvark/jsonapi-client
```

`@netvark/resource-core` and `@netvark/jsonapi-client` are peer dependencies: your application
declares the resources and defines its messages with its own copy of the one, and calls its API and
catches its errors with its own copy of the other, and the bindings read those same values
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
The root entry runs wherever JavaScript does, so server rendering on Node 22.12+, Bun, Deno, and
Cloudflare Workers reads the same model as the browser. `@netvark/react-resource/form` needs
[TanStack Form](https://tanstack.com/form/v1) 1.17 or later and `@netvark/react-resource/query`
[TanStack Query](https://tanstack.com/query/v5) 5.89 or later, each an optional peer that only its
entry imports:

```bash
pnpm add @tanstack/react-form @tanstack/react-query
```

The list model, `resourceList`, is in the root entry and needs no peer: it reads and writes
[TanStack Table](https://tanstack.com/table/v9) v9's sorting and column filters as plain values, so
the screens that render a table bring Table themselves.

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
- Build an update model from the record the screen shows, and again whenever that record changes:
  `useMemo(() => resourceForm(Contacts, 'update', { messages, record }), [record])`. `write`
  compares the values with the record its model was built from, so a model kept from an earlier read
  sends again what the person already saved once the record refetches after a save.
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

## TanStack Form

`@netvark/react-resource/form` hands a form model to
[TanStack Form](https://tanstack.com/form/v1/docs/framework/react/guides/validation).
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

## Lists

`resourceList(resource, messages)` is a framework-free model of a list screen. Its state is the
client's list query, the `sort`, `filter`, `page`, and `search` a list request sends; the model
reads it as [TanStack Table v9](https://tanstack.com/table/v9/docs/framework/react/react-table)'s
sorting and column filters, writes each change Table hands back as the next state, follows a
result's links to the next and previous pages, and reads a route's search back leniently, so a stale
or edited link opens the list with what the definition accepts. Build it once, at module scope,
beside the descriptors:

```ts
// src/contacts/contacts-list.ts
import { fieldsOf, resourceList } from '@netvark/react-resource';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const contactsList = resourceList(Contacts, messages);
export const contactFields = fieldsOf(Contacts, messages);
```

Keep the state in the route's search. With [TanStack Router](https://tanstack.com/router/v1),
`validateSearch` reads it, the query key follows it, and every change is a navigation, so Back, a
reload, and a shared link open the same page:

```tsx
// src/routes/contacts.tsx
import type { RecordOf } from '@netvark/jsonapi-client';
import type { ListState } from '@netvark/react-resource';

import type { definitions } from '../api/clients';
import type { Contacts } from '../resources/contacts';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  columnFilteringFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import { contacts } from '../api/queries';
import { contactFields, contactsList } from '../contacts/contacts-list';

type Contact = RecordOf<typeof definitions, typeof definitions.contacts>;

export const Route = createFileRoute('/contacts')({
  // A stale or edited link opens the list with what the definition accepts.
  validateSearch: (search: Record<string, unknown>) => contactsList.query(search),
  component: ContactsScreen,
});

// At module scope: Table rebuilds its rows when its features, columns, or data are new.
const features = tableFeatures({ rowSortingFeature, columnFilteringFeature });
const column = createColumnHelper<typeof features, Contact>();
const member = (name: 'name' | 'email' | 'status' | 'priority') =>
  column.accessor(name, {
    header: () => contactFields[name].label(),
    enableSorting: contactFields[name].sortable,
  });
const columns = column.columns([
  member('name'),
  member('email'),
  member('status'),
  member('priority'),
]);
const noContacts: ReadonlyArray<Contact> = [];
const sortOrders = { asc: 'ascending', desc: 'descending' } as const;

function ContactsScreen() {
  const state = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (next: ListState<typeof Contacts>) => void navigate({ search: next });
  // The previous page stays on screen while the next one loads.
  const result = useQuery({ ...contacts.list(state), placeholderData: keepPreviousData });
  const table = useTable({
    features,
    columns,
    data: result.data?.data ?? noContacts,
    getRowId: (contact) => contact.id,
    // The server sorts and filters; Table shows the model's state and hands each change back.
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting: contactsList.sorting(state),
      columnFilters: contactsList.columnFilters(state),
    },
    onSortingChange: (updater) => go(contactsList.withSorting(state, updater)),
    onColumnFiltersChange: (updater) => go(contactsList.withColumnFilters(state, updater)),
  });
  const status = table.getColumn('status');
  const statusFilter = status?.getFilterValue() as { readonly eq?: string } | undefined;
  const next = result.data && contactsList.next(state, result.data);
  const previous = result.data && contactsList.previous(state, result.data);
  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('search');
          go(contactsList.withSearch(state, typeof text === 'string' ? text : ''));
        }}
      >
        {/* The key resets the input when the route's search changes, as on Back. */}
        <input
          key={state.search}
          name="search"
          type="search"
          aria-label="Search"
          defaultValue={state.search}
        />
      </form>
      <select
        aria-label={contactFields.status.label()}
        value={statusFilter?.eq ?? ''}
        onChange={({ target }) =>
          status?.setFilterValue(target.value === '' ? undefined : { eq: target.value })
        }
      >
        <option value="">All</option>
        {contactFields.status.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th key={header.id} aria-sort={sorted ? sortOrders[sorted] : undefined}>
                    <button
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={previous === undefined} onClick={() => previous && go(previous)}>
        Previous
      </button>
      <button disabled={next === undefined} onClick={() => next && go(next)}>
        Next
      </button>
    </>
  );
}
```

| Member                                                      | Gives                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `query(search)`                                             | the state a route's search holds, as JSON or as parameters, refusals dropped                       |
| `sorting(state)`, `withSorting(state, sorting)`             | Table's `sorting`, the declaration's default without `sort`, and back                              |
| `columnFilters(state)`, `withColumnFilters(state, filters)` | Table's `columnFilters`, each condition an object of operators, and back                           |
| `withSearch(state, text)`                                   | the state searching `text`; empty text removes `search`                                            |
| `withPageSize(state, size)`                                 | the state at `size` records a page                                                                 |
| `next(state, result)`, `previous(state, result)`            | the state at the page the result's links name; `undefined` at an end                               |
| `first(state)`                                              | the state at the first page                                                                        |
| `params(state)`                                             | the parameters a list request for `state` sends                                                    |
| `columns`, `page`, `searchable`                             | the descriptors of the members a read returns, the page sizes, and whether the definition searches |

## List rules

- Build the model once, at module scope. `columns` holds descriptors, so its labels, like
  `fieldsOf`'s, render in the locale of each render.
- Keep in the state only what the person changes. `query` reads `sort`, `filter`, `page`, and
  `search`, never `include` or `fields`; add what the screen always reads at the call:
  `contacts.list({ ...state, include: ['organization'] })`.
- `query` takes the JSON a router keeps and the API's own parameters, as a string or
  `URLSearchParams`, and drops each member the definition refuses, such as a filter of a member that
  no longer filters or a page size over `page.max`. JSON keeps its own forms, so a router that
  validates the search after every navigation reads back the state it wrote; parameters read one
  value as text and a repeated one as a list, as the API does.
- `query` names every member of the list query, `undefined` where the state holds none. TanStack
  Router hands a route the URL's search with the validated one spread over it, so a member left out
  would pass through as the URL holds it; with the router registered, `Route.useSearch()` is the
  `ListState` that `query` returns, and an `undefined` member never reaches the URL.
- Every change but paging starts at the first page: sorting, filtering, searching, and resizing drop
  `page.after` and `page.before` and keep `page.size`, since a cursor belongs to the order and the
  conditions it was issued under. Each function returns a new state and keeps every member it does
  not set.
- Give Table the model's `sorting` and `columnFilters` as its state on every render, with
  `manualSorting` and `manualFiltering`: the server sorts and filters, and Table shows the page it
  returned. The setters take Table's updaters as they are. Offer sorting where the descriptor is
  `sortable`; without `sort`, Table shows the declaration's default order as its sorting.
- A column filter's value is an object of its member's declared operators, `filter.operators`:
  `{ eq: 'active' }`, `{ in: ['active', 'paused'] }`, `{ gte: 2, lte: 4 }`. An operator set to
  `undefined` or to an empty list is left out, and a filter left without one is removed, so an
  emptied input clears its filter. `columnFilters` reads a bare value, `filter[status]=active`, as
  `{ eq: 'active' }`, and `withColumnFilters` keeps `filter.or`, which no column holds.
- Page by `next` and `previous`, each `undefined` at an end, and start over with `first`. A cursor
  counts no pages, so leave out Table's pagination feature, which pages by index.
- Keep the previous page on screen while the next one loads with
  `placeholderData: keepPreviousData`, and keep Table's features, columns, and the empty array of
  the first load at module scope. Key rows by `getRowId`, so a row keeps its state across pages and
  refetches.
- Search when the person submits, or debounce typing: each state is a request and a history entry.
- `query` checks names and shapes, while the server alone checks values, such as a date or an
  expired cursor: it refuses one with a `400` whose error names its parameter in `source.parameter`.
  Recover by the state: `first(state)` for `page[after]` or `page[before]`, and `withColumnFilters`
  without the filter it names otherwise.
- `resourceList` throws `TypeError` for a resource no `declareResource` returned and for messages as
  `fieldsOf` does. Its functions throw for a state that is no list state; a sort of a member that
  does not sort, or of one member twice; a filter of a member that does not filter, with an operator
  its member does not declare, or whose value is no object of operators; a page size that is no
  positive safe integer up to `page.max`; a result no `list` returned; and `withSearch` on a
  definition without a search parameter, which TypeScript refuses too. A message names the function
  and the type, never a value.
