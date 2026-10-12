import type { FormErrors } from '../form/form-types';

import {
  createFormHook,
  createFormHookContexts,
  FormApi,
  useField,
  useForm,
} from '@tanstack/react-form';
import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@netvark/jsonapi-client';
import { createDeclareResource } from '@netvark/resource-core';

import { resourceForm } from '../form/resource-form';
import { messages } from '../test-support/messages';
import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { bindResponseErrors } from './bind-errors';
import { resourceFormOptions } from './form-options';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['get', 'create'],
  fields: { name: { access: 'readWrite' }, vip: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'readWrite' },
  },
});

const clients = createClients(
  { organizations: Organizations.resource, contacts: Contacts.resource },
  createTransport({ origin: 'https://api.example.test' }),
);

const create = resourceForm(Contacts, 'create', { messages });

interface Values {
  readonly name: string;
  readonly vip: boolean | null;
  readonly organization: string;
}

const { fieldContext, formContext } = createFormHookContexts();
const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
});

/** A screen's form, in useForm and in the useAppForm of createFormHook alike. */
function CreateScreen() {
  const form = useForm({ ...resourceFormOptions(create) });
  const app = useAppForm({ ...resourceFormOptions(create) });
  expectTypeOf(form.state.values).toEqualTypeOf<Values>();
  expectTypeOf(app.state.values).toEqualTypeOf<Values>();
  return null;
}

/** A submit handler that sends the model's write through the client, and binds a refusal. */
function SubmittingScreen() {
  const form = useForm({
    ...resourceFormOptions(create),
    onSubmit: async ({ value, formApi }) => {
      try {
        await clients.contacts.create(create.write(value));
      } catch (error) {
        expectTypeOf(bindResponseErrors(formApi, create, error)).toEqualTypeOf<
          FormErrors<'name' | 'vip' | 'organization'>
        >();
      }
    },
  });
  bindResponseErrors(form, create, null);
  return form;
}

/** A field component, which renders its errors' messages. */
function NameField() {
  const form = useForm({ ...resourceFormOptions(create) });
  const field = useField({ form, name: 'name' });
  expectTypeOf(field.state.meta.errors[0]?.message).toEqualTypeOf<
    string | undefined
  >();
  return null;
}

describe('resourceFormOptions with TanStack Form (resource SPEC 20.5)', () => {
  it("types a form's values as the model's, in useForm and in useAppForm alike", () => {
    expectTypeOf(CreateScreen).toBeFunction();
  });

  it("hands the submit handler values the model's write takes, for the client's create", () => {
    expectTypeOf(SubmittingScreen).toBeFunction();
  });

  it('gives a field component every error as an object with a message', () => {
    expectTypeOf(NameField).toBeFunction();
  });
});

describe('bindResponseErrors with TanStack Form (resource SPEC 20.5)', () => {
  it('takes the formApi of a submit handler and what useForm returned, and types the texts by member', () => {
    expectTypeOf(SubmittingScreen).returns.toExtend<
      Parameters<typeof bindResponseErrors>[0]
    >();
  });

  it('takes a FormApi made with new, of any submit meta', () => {
    bindResponseErrors(
      new FormApi({ ...resourceFormOptions(create) }),
      create,
      null,
    );
    bindResponseErrors(
      new FormApi({
        ...resourceFormOptions(create),
        onSubmitMeta: { action: 'save' },
      }),
      create,
      null,
    );
  });

  it('refuses a form that lacks a member the model holds, and takes one that holds more', () => {
    const names = resourceForm(Contacts, 'create', {
      messages,
      members: ['name'],
    });
    const narrow = new FormApi({ ...resourceFormOptions(names) });
    const wide = new FormApi({ ...resourceFormOptions(create) });
    // @ts-expect-error -- the form holds no `vip` or `organization`
    bindResponseErrors(narrow, create, null);
    bindResponseErrors(wide, names, null);
  });
});
