import type { ReactElement } from 'react';

/**
 * The edit screen of the screen tests (resource SPEC 20.8), as an
 * application writes one: the record TanStack Query reads, an update model
 * built from it once per record, TanStack Form over its options, and a
 * submit that sends the model's write through `resourceQueries`' `update`,
 * so only what the person changed travels. Not published with the
 * package.
 * @packageDocumentation
 */
import type { ScreenQueries, ScreenRecord } from './screen-queries';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { resourceForm } from '../../form/resource-form';
import { bindResponseErrors } from '../../tanstack-form/bind-errors';
import { resourceFormOptions } from '../../tanstack-form/form-options';
import { messages } from '../messages';
import { Contacts } from '../resources';
import { contactField } from './contact-fields';
import { ChoiceInput, TextInput } from './inputs';

const nameField = contactField('name');
const nicknameField = contactField('nickname');
const statusField = contactField('status');

interface EditProps {
  readonly api: ScreenQueries;
  readonly id: string;
}

/** The form over one record, built again only when the record changes. */
function EditForm({
  api,
  id,
  record,
}: EditProps & { readonly record: ScreenRecord }): ReactElement {
  const model = useMemo(
    () =>
      resourceForm(Contacts, 'update', {
        messages,
        record,
        members: ['name', 'nickname', 'status'],
      }),
    [record],
  );
  const update = useMutation(api.contacts.update());
  const form = useForm({
    ...resourceFormOptions(model),
    onSubmit: async ({ value, formApi }) => {
      try {
        await update.mutateAsync({ id, ...model.write(value) });
      } catch (error) {
        bindResponseErrors(formApi, model, error);
      }
    },
  });
  return (
    <form
      aria-label="Kontakt bearbeiten"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => <TextInput field={field} label={nameField.label()} />}
      </form.Field>
      <form.Field name="nickname">
        {(field) => <TextInput field={field} label={nicknameField.label()} />}
      </form.Field>
      <form.Field name="status">
        {(field) => (
          <ChoiceInput
            field={field}
            label={statusField.label()}
            options={statusField.options ?? []}
          />
        )}
      </form.Field>
      <button type="submit" disabled={update.isPending}>
        Speichern
      </button>
      {update.isSuccess && <p role="status">Gespeichert</p>}
    </form>
  );
}

/** The contact `id`, loaded, then its form. */
export function EditContact({ api, id }: EditProps): ReactElement {
  const contact = useQuery(api.contacts.get(id));
  if (contact.data === undefined) {
    return <p>Lädt</p>;
  }
  return <EditForm api={api} id={id} record={contact.data.data} />;
}
