import type { ReactElement } from 'react';

/**
 * The create screen of the screen tests (resource SPEC 20.8), as an
 * application writes one: TanStack Form over `resourceFormOptions` of a
 * model built once, the organization chosen among the records TanStack
 * Query reads, and a submit that sends the model's write through
 * `resourceQueries`' `create` and binds a refusal onto the fields, the
 * screen's own text in the banner when the refusal places nothing. Not
 * published with the package.
 * @packageDocumentation
 */
import type { ScreenQueries, ScreenRecord } from './screen-queries';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { resourceForm } from '@netvark/resource-ui';

import { bindResponseErrors } from '../../tanstack-form/bind-errors';
import { resourceFormOptions } from '../../tanstack-form/form-options';
import { messages } from '../messages';
import { Contacts } from '../resources';
import { contactField } from './contact-fields';
import { ChoiceInput, TextInput } from './inputs';

/** The screen's own text when a refusal places nothing. */
export const NOT_SAVED = 'Der Kontakt wurde nicht gespeichert.';

/** Built once, at startup, as the labels read the locale of each render. */
const model = resourceForm(Contacts, 'create', {
  messages,
  members: ['name', 'email', 'status', 'organization'],
});
const nameField = contactField('name');
const emailField = contactField('email');
const statusField = contactField('status');
const organizationField = contactField('organization');
const noOrganizations: ReadonlyArray<ScreenRecord> = [];

function nameOf(record: ScreenRecord): string {
  const { name } = record;
  return typeof name === 'string' ? name : record.id;
}

/** A form that creates a contact. */
export function CreateContact({
  api,
}: {
  readonly api: ScreenQueries;
}): ReactElement {
  const [banner, setBanner] = useState<ReadonlyArray<string>>([]);
  const organizations = useQuery(api.organizations.list());
  const create = useMutation(api.contacts.create());
  const form = useForm({
    ...resourceFormOptions(model),
    onSubmit: async ({ value, formApi }) => {
      setBanner([]);
      try {
        await create.mutateAsync(model.write(value));
        formApi.reset();
      } catch (error) {
        const refusal = bindResponseErrors(formApi, model, error);
        const placed =
          Object.keys(refusal.fields).length > 0 || refusal.form.length > 0;
        setBanner(placed ? refusal.form : [NOT_SAVED]);
      }
    },
  });
  const choices = (organizations.data?.data ?? noOrganizations).map(
    (record) => ({ value: record.id, label: () => nameOf(record) }),
  );
  return (
    <form
      aria-label="Kontakt anlegen"
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
      <form.Field name="name">
        {(field) => <TextInput field={field} label={nameField.label()} />}
      </form.Field>
      <form.Field name="email">
        {(field) => <TextInput field={field} label={emailField.label()} />}
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
      <form.Field name="organization">
        {(field) => (
          <ChoiceInput
            field={field}
            label={organizationField.label()}
            options={choices}
          />
        )}
      </form.Field>
      <button type="submit" disabled={create.isPending}>
        Speichern
      </button>
    </form>
  );
}
