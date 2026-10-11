import type { Contacts as UntypedContacts } from '../test-support/registry';
import type { MessagesFor } from './messages-for';
import type {
  CodeInputs,
  ConstraintInputs,
  ErrorText,
  IssueInputs,
  Label,
  Message,
} from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite' },
    email: { access: 'readWrite' },
    kind: { access: 'readWrite' },
    status: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

const RESOURCES = [Organizations, Contacts] as const;
const APP_ERRORS = {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
} as const;
const english = defaultMessages(RESOURCES, APP_ERRORS);

type ContactMessages = MessagesFor<typeof RESOURCES, typeof APP_ERRORS>;
type Errors = ContactMessages['errors'];

/**
 * What Paraglide JS 2.26 compiles a message to with `--emit-ts-declarations`:
 * its inputs, an optional locale, and a branded string. The end-to-end
 * suite checks the compiled output itself.
 * @ref https://github.com/opral/paraglide-js/blob/main/docs/basics.md
 */
type LocalizedString = string & { readonly __brand: 'LocalizedString' };
type Options = { locale?: 'en' | 'de' };
type Paraglide<TInputs> = (
  inputs: TInputs,
  options?: Options,
) => LocalizedString;
// Paraglide writes an input's type as NonNullable<unknown>, and a message
// without inputs as taking `{}`; both are mirrored as it compiles them.
type ParaglideLabel = (
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: mirrors Paraglide's generated declaration
  inputs?: Record<never, never>,
  options?: Options,
) => LocalizedString;
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: mirrors Paraglide's generated declaration
type Input = NonNullable<unknown>;

declare const maxLength: Paraglide<{ limit: Input }>;
declare const count: Paraglide<{ count: Input }>;
declare const contactName: ParaglideLabel;

describe('MessagesFor (SPEC 10.1)', () => {
  it("requires the texts of every code no resource derives, the application's among them", () => {
    expectTypeOf<Errors['NOT_FOUND']>().toEqualTypeOf<ErrorText<CodeInputs>>();
    expectTypeOf<Errors['QUOTA_EXCEEDED']>().toEqualTypeOf<
      ErrorText<CodeInputs>
    >();
    expectTypeOf<Errors['SEAT_LIMIT']>().toEqualTypeOf<ErrorText<CodeInputs>>();
  });

  it('makes the derived codes and the other built-in codes optional', () => {
    expectTypeOf<Errors['CONTACTS_EMAIL_UNIQUE']>().toEqualTypeOf<
      ErrorText<ConstraintInputs> | undefined
    >();
    expectTypeOf<Errors['TOO_MANY_REQUESTS']>().toEqualTypeOf<
      ErrorText<CodeInputs> | undefined
    >();
  });

  it('requires exactly the constraint kinds the derived codes have', () => {
    expectTypeOf<keyof ContactMessages['constraints']>().toEqualTypeOf<
      'check' | 'notNull' | 'unique'
    >();
  });

  it('types each issue kind with the inputs it receives', () => {
    expectTypeOf<ContactMessages['validation']['maxLength']>().toEqualTypeOf<
      Message<IssueInputs['maxLength']>
    >();
    expectTypeOf<IssueInputs['enum']>().toEqualTypeOf<
      CodeInputs & { readonly values: string }
    >();
    expectTypeOf<IssueInputs['pattern']>().toEqualTypeOf<CodeInputs>();
  });

  it('labels every member of every type, and every option of every field with options', () => {
    expectTypeOf<keyof ContactMessages['fields']>().toEqualTypeOf<
      'organizations' | 'contacts'
    >();
    expectTypeOf<keyof ContactMessages['fields']['contacts']>().toEqualTypeOf<
      'name' | 'email' | 'kind' | 'status' | 'organization'
    >();
    expectTypeOf<ContactMessages['options']>().toEqualTypeOf<{
      readonly contacts: {
        readonly kind: { readonly person: Label; readonly company: Label };
        readonly status: { readonly active: Label; readonly archived: Label };
      };
    }>();
  });

  it('leaves the options section empty when no field has options', () => {
    expectTypeOf<
      MessagesFor<readonly [typeof Organizations]>['options']
    >().toEqualTypeOf<{ readonly [type: string]: never }>();
  });

  it('opens the parts of a resource whose table TypeScript does not know', () => {
    type Open = MessagesFor<readonly [typeof UntypedContacts]>;
    expectTypeOf<Open['fields']>().toEqualTypeOf<{
      readonly [type: string]: { readonly [member: string]: Label };
    }>();
  });

  it('takes Paraglide message functions as they compile', () => {
    expectTypeOf(maxLength).toExtend<
      ContactMessages['validation']['maxLength']
    >();
    expectTypeOf(contactName).toExtend<Label>();
    expectTypeOf(contactName).toExtend<Errors['NOT_FOUND']['detail']>();
    expectTypeOf(count).not.toExtend<
      ContactMessages['validation']['maxLength']
    >();
    expectTypeOf(maxLength).not.toExtend<Label>();
  });
});

describe('defineMessages (SPEC 10.1)', () => {
  it('returns MessagesFor its resources and codes', () => {
    expectTypeOf(
      defineMessages(RESOURCES, APP_ERRORS, english),
    ).toEqualTypeOf<ContactMessages>();
  });

  it('refuses messages missing a code, a constraint kind, an issue kind, a label, or an option', () => {
    const errors: Omit<Errors, 'NOT_FOUND'> = english.errors;
    const constraints: Omit<ContactMessages['constraints'], 'unique'> =
      english.constraints;
    const validation: Omit<ContactMessages['validation'], 'pattern'> =
      english.validation;
    const labels: Omit<ContactMessages['fields']['contacts'], 'email'> =
      english.fields.contacts;
    const fields = { ...english.fields, contacts: labels };
    const status: Omit<
      ContactMessages['options']['contacts']['status'],
      'archived'
    > = english.options.contacts.status;
    const kinds = { ...english.options.contacts, status };
    const options = { contacts: kinds };
    // @ts-expect-error errors: NOT_FOUND is missing
    defineMessages(RESOURCES, APP_ERRORS, { ...english, errors });
    // @ts-expect-error constraints: unique is missing
    defineMessages(RESOURCES, APP_ERRORS, { ...english, constraints });
    // @ts-expect-error validation: pattern is missing
    defineMessages(RESOURCES, APP_ERRORS, { ...english, validation });
    // @ts-expect-error fields.contacts: email is missing
    defineMessages(RESOURCES, APP_ERRORS, { ...english, fields });
    // @ts-expect-error options.contacts.status: archived is missing
    defineMessages(RESOURCES, APP_ERRORS, { ...english, options });
  });

  it('refuses a key the resources and codes do not have', () => {
    defineMessages(RESOURCES, APP_ERRORS, {
      ...english,
      errors: {
        ...english.errors,
        // @ts-expect-error TYPO is not a code; it is not inferred as an application code
        TYPO: english.errors.NOT_FOUND,
      },
    });
    defineMessages(RESOURCES, APP_ERRORS, {
      ...english,
      constraints: {
        ...english.constraints,
        // @ts-expect-error exclusion: no derived code has that kind
        exclusion: english.errors.NOT_FOUND,
      },
    });
    defineMessages(RESOURCES, APP_ERRORS, {
      ...english,
      options: {
        contacts: {
          ...english.options.contacts,
          kind: {
            ...english.options.contacts.kind,
            // @ts-expect-error robot is not an option of kind
            robot: () => 'Roboter',
          },
        },
      },
    });
  });

  it("lets a derived code override its kind's texts, with its members' labels", () => {
    expectTypeOf(
      defineMessages(RESOURCES, APP_ERRORS, {
        ...english,
        errors: {
          ...english.errors,
          CONTACTS_EMAIL_UNIQUE: {
            title: () => 'E-Mail vergeben',
            detail: ({ fields }) => `${fields} ist vergeben.`,
          },
        },
      }),
    ).toEqualTypeOf<ContactMessages>();
  });

  it('refuses a message needing an input its kind does not receive', () => {
    const errors: Errors = {
      ...english.errors,
      NOT_FOUND: {
        title: () => 'Nicht gefunden',
        // @ts-expect-error a code no resource derives has no `fields`
        detail: ({ fields }) => fields,
      },
    };
    const validation: ContactMessages['validation'] = {
      ...english.validation,
      // @ts-expect-error minLength receives `limit`, not `values`
      minLength: ({ values }) => values,
    };
    // @ts-expect-error a title receives no inputs
    const title: Label = count;
    expectTypeOf([errors, validation, title]).toBeArray();
  });
});
