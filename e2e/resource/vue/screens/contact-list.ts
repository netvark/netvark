/**
 * The contacts application's list as a Vue application writes it
 * (resource SPEC 20.6, 20.7), a render function in place of a single-file
 * component's template: the list model's state in a `shallowRef`, replaced
 * whole on each change as the model returns a new one; the page Vue
 * Query's `useQuery` reads for it, its options from a getter, so a new
 * state reads its own page; a search the person submits; and a button per
 * contact that removes them through `useMutation` of `resourceQueries`'
 * `remove`, which refetches the list.
 * @ref https://tanstack.com/query/v5/docs/framework/vue/reactivity ("reactive getters")
 * @ref https://vuejs.org/api/reactivity-advanced.html#shallowref
 * @ref https://tanstack.com/query/v5/docs/framework/vue/guides/invalidations-from-mutations
 */
import type { ListState } from '@netvark/resource-ui';

import type { Contact, ContactQueries } from '../../support/contact-queries.ts';

import { useMutation, useQuery } from '@tanstack/vue-query';
import { defineComponent, h, shallowRef } from 'vue';

import { fieldsOf, resourceList } from '@netvark/resource-ui';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';

/** Built once, at startup, beside the descriptors. */
const contactsList = resourceList(Contacts, contactMessages);
const contactFields = fieldsOf(Contacts, contactMessages);
const noContacts: ReadonlyArray<Contact> = [];

/** The text of the input named `name` in the form `event` submits. */
function submitted(event: Event, name: string): string {
  const text =
    event.currentTarget instanceof HTMLFormElement
      ? new FormData(event.currentTarget).get(name)
      : null;
  return typeof text === 'string' ? text : '';
}

/** The editor's contacts, a search over them, and a removal per contact. */
export const ContactList = defineComponent(
  (props: { readonly api: ContactQueries }) => {
    const state = shallowRef<ListState<typeof Contacts>>(
      contactsList.query({}),
    );
    const result = useQuery(() => props.api.contacts.list(state.value));
    const remove = useMutation(props.api.contacts.remove());
    const row = (contact: Contact) =>
      h('tr', { key: contact.id }, [
        h('td', contact.name),
        h('td', contact.email ?? ''),
        h(
          'td',
          h(
            'button',
            {
              type: 'button',
              'aria-label': `${contact.name} entfernen`,
              disabled: remove.isPending.value,
              onClick: () => {
                remove.mutate(contact.id);
              },
            },
            'Entfernen',
          ),
        ),
      ]);
    return () => [
      h(
        'form',
        {
          role: 'search',
          onSubmit: (event: Event) => {
            event.preventDefault();
            state.value = contactsList.withSearch(
              state.value,
              submitted(event, 'search'),
            );
          },
        },
        h('input', { name: 'search', type: 'search', 'aria-label': 'Suche' }),
      ),
      h('table', [
        h(
          'thead',
          h('tr', [
            h('th', contactFields.name.label()),
            h('th', contactFields.email.label()),
            h('th'),
          ]),
        ),
        h(
          'tbody',
          (result.data.value?.data ?? noContacts).map((contact) =>
            row(contact),
          ),
        ),
      ]),
    ];
  },
  { name: 'ContactList', props: ['api'] },
);
